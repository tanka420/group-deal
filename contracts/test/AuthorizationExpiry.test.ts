import {expect} from "chai";
import {ethers} from "hardhat";
import {time} from "@nomicfoundation/hardhat-network-helpers";

const types={BuyAuthorization:[{name:"chainId",type:"uint256"},{name:"hubContract",type:"address"},{name:"campaignId",type:"uint256"},{name:"termsHash",type:"bytes32"},{name:"campaignIdentity",type:"bytes32"},{name:"buyerWallet",type:"address"},{name:"nonce",type:"uint256"},{name:"maxQuantity",type:"uint256"},{name:"deadline",type:"uint256"}]};
async function fixture(version:1|2){
 const [,seller,buyer,signer,operator,security]=await ethers.getSigners();
 const token=await(await ethers.getContractFactory("MockUSDC")).deploy();
 const hub=version===1
  ?await(await ethers.getContractFactory("GroupDealHub")).deploy(await token.getAddress(),signer.address,operator.address,security.address)
  :await(await ethers.getContractFactory("GroupDealHubV2")).deploy(await token.getAddress(),signer.address,operator.address,security.address);
 const terms={sellerPayoutWallet:seller.address,metric:1,maxPerAccount:5,inventoryLimit:10,durationSeconds:86400,deliverySlaSeconds:86400,earlyRebateEnabled:false,earlySlotsCount:0,earlyRebateAmount:0,earlyRebateBps:0,platformFeeBps:0,termsHash:ethers.id("deadline terms")};
 await hub.connect(seller).createCampaign(terms,[{threshold:1,price:1_000_000},{threshold:2,price:800_000}]);
 await token.mint(buyer.address,10_000_000);await token.connect(buyer).approve(await hub.getAddress(),10_000_000);
 const chainId=(await ethers.provider.getNetwork()).chainId,hubContract=await hub.getAddress(),identity=ethers.id("expiry buyer"),deadline=(await time.latest())+100;
 const sign=(until:number)=>signer.signTypedData({name:"GroupDealHub",version:"1",chainId,verifyingContract:hubContract},types,{chainId,hubContract,campaignId:1,termsHash:terms.termsHash,campaignIdentity:identity,buyerWallet:buyer.address,nonce:0,maxQuantity:1,deadline:until});
 return {token,hub,buyer,identity,deadline,sign};
}
describe("BUY authorization expiry boundaries on actual local V1 and V2 bytecode",()=>{
 for(const version of [1,2] as const){
  it(`V${version} accepts the inclusive deadline and consumes exactly one identity nonce`,async()=>{
   const {hub,buyer,identity,deadline,sign}=await fixture(version),signature=await sign(deadline);await time.setNextBlockTimestamp(deadline);
   await expect(hub.connect(buyer).commitToBuy(1,identity,1,false,1,deadline,signature)).to.emit(hub,"CommitmentMade");
   expect(await hub.identityNonces(1,identity)).to.equal(1n);expect((await hub.orders(1)).committedGross).to.equal(1_000_000n);
  });
  it(`V${version} expired calldata cannot spend or consume a nonce; a fresh signed quote may buy`,async()=>{
   const {token,hub,buyer,identity,deadline,sign}=await fixture(version),signature=await sign(deadline),before=await token.balanceOf(buyer.address);await time.setNextBlockTimestamp(deadline+1);
   await expect(hub.connect(buyer).commitToBuy(1,identity,1,false,1,deadline,signature)).to.be.revertedWith("Authorization expired");
   expect(await hub.identityNonces(1,identity)).to.equal(0n);expect(await hub.buyerUnitsCommitted(1,identity)).to.equal(0n);expect(await token.balanceOf(buyer.address)).to.equal(before);expect(await token.balanceOf(await hub.getAddress())).to.equal(0n);
   const fresh=deadline+100;await hub.connect(buyer).commitToBuy(1,identity,1,false,1,fresh,await sign(fresh));expect(await hub.identityNonces(1,identity)).to.equal(1n);expect(await token.balanceOf(buyer.address)).to.equal(before-1_000_000n);
  });
 }
});
