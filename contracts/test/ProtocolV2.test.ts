import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { compiledV2Runtime } from "../scripts/compiledRuntime";

const amount=(value:number)=>ethers.parseUnits(String(value),6);
const authorizationTypes={BuyAuthorization:[{name:"chainId",type:"uint256"},{name:"hubContract",type:"address"},{name:"campaignId",type:"uint256"},{name:"termsHash",type:"bytes32"},{name:"campaignIdentity",type:"bytes32"},{name:"buyerWallet",type:"address"},{name:"nonce",type:"uint256"},{name:"maxQuantity",type:"uint256"},{name:"deadline",type:"uint256"}]};
async function fixture(version=2) {
  const [owner,seller,buyer,auth,operator,security]=await ethers.getSigners();
  const usdc=await (await ethers.getContractFactory("MockUSDC")).deploy();
  const hub=version===2
    ?await (await ethers.getContractFactory("GroupDealHubV2")).deploy(await usdc.getAddress(),auth.address,operator.address,security.address)
    :await (await ethers.getContractFactory("GroupDealHub")).deploy(await usdc.getAddress(),auth.address,operator.address,security.address);
  await usdc.mint(buyer.address,amount(1000));await usdc.connect(buyer).approve(await hub.getAddress(),amount(1000));
  const terms={sellerPayoutWallet:seller.address,metric:1,maxPerAccount:5,inventoryLimit:10,durationSeconds:86400,deliverySlaSeconds:86400,earlyRebateEnabled:true,earlySlotsCount:1,earlyRebateAmount:amount(90),earlyRebateBps:0,platformFeeBps:0,termsHash:ethers.id("protocol-v2 resource terms")};
  const tiers=[{threshold:1,price:amount(100)},{threshold:2,price:amount(20)}];
  return {owner,seller,buyer,auth,operator,security,usdc,hub,terms,tiers};
}
async function committed(version=2) {
  const context=await fixture(version),{hub,buyer,auth,terms,tiers}=context;
  await hub.connect(context.seller).createCampaign(terms,tiers);
  const chainId=(await ethers.provider.getNetwork()).chainId,identity=ethers.id("buyer fixture identity"),deadline=(await time.latest())+3600,hubContract=await hub.getAddress();
  const signature=await auth.signTypedData({name:"GroupDealHub",version:"1",chainId,verifyingContract:hubContract},authorizationTypes,{chainId,hubContract,campaignId:1,termsHash:terms.termsHash,campaignIdentity:identity,buyerWallet:buyer.address,nonce:0,maxQuantity:2,deadline});
  await hub.connect(buyer).commitToBuy(1,identity,2,true,2,deadline,signature);
  await time.increase(86401);await hub.finalizeCampaign(1);
  return context;
}
describe("Protocol v2 candidate: first-unit rebate and validated terms",()=>{
  it("matches initialized compiler runtime including EIP-712 and USDC immutables",async()=>{
    const {hub,usdc}=await fixture(),address=await hub.getAddress(),token=await usdc.getAddress(),chainId=(await ethers.provider.getNetwork()).chainId;
    const expected=await compiledV2Runtime(address,token,chainId),actual=await ethers.provider.getCode(address);
    expect(expected).to.equal(actual);expect(ethers.keccak256(expected)).to.equal(ethers.keccak256(actual));
    expect(await compiledV2Runtime(address,ethers.ZeroAddress,chainId)).not.to.equal(actual);
    expect(await compiledV2Runtime(address,token,chainId+1n)).not.to.equal(actual);
    expect(await compiledV2Runtime(ethers.ZeroAddress,token,chainId)).not.to.equal(actual);
  });
  it("retains v1 economics while v2 preserves the second unit's clearing price",async()=>{
    const legacy=await committed(1),candidate=await committed(2);
    expect((await legacy.hub.getOrderDetails(1)).rebateAllocated).to.equal(amount(200));
    expect(await (candidate.hub as any).protocolVersion()).to.equal(2);
    const order=await candidate.hub.getOrderDetails(1);expect(order.committedGross).to.equal(amount(200));expect(order.earlyRebateValue).to.equal(amount(90));expect(order.rebateAllocated).to.equal(amount(180));
    await candidate.hub.allocateRebatesBatch(1,0,1);expect((await candidate.hub.orders(1)).rebateAllocated).to.equal(amount(180));
    await candidate.hub.connect(candidate.seller).recordDelivery(1,1,ethers.id("actual fixture delivery proof"));
    await candidate.hub.connect(candidate.buyer).confirmReceipt(1,1);
    expect((await candidate.hub.orders(1)).sellerAllocated).to.equal(amount(20));
    await candidate.hub.connect(candidate.buyer).claimBuyerFunds(1,[1]);await candidate.hub.connect(candidate.seller).claimSellerProceeds(1,[1]);
    expect(await candidate.usdc.balanceOf(await candidate.hub.getAddress())).to.equal(0);
  });
  it("lazy claims retain a later breach refund after the early/tier rebate was already withdrawn",async()=>{
    const {hub,buyer,usdc}=await committed();
    await hub.connect(buyer).claimBuyerFunds(1,[1]);expect(await hub.buyerClaimedAmount(1)).to.equal(amount(180));
    await time.increase(86401);await hub.connect(buyer).claimDeliveryBreach(1,1);
    expect((await hub.orders(1)).buyerRefundAllocated).to.equal(amount(20));
    await hub.connect(buyer).claimBuyerFunds(1,[1]);expect(await hub.buyerClaimedAmount(1)).to.equal(amount(200));
    expect(await usdc.balanceOf(await hub.getAddress())).to.equal(0);
  });
  it("rejects contradictory early terms and unreachable tier/account inventory configurations",async()=>{
    const {hub,terms,tiers}=await fixture();
    for(const [override,reason] of [
      [{earlySlotsCount:0},"Early slots required"],
      [{earlyRebateBps:1},"Choose fixed or percentage early rebate"],
      [{earlyRebateAmount:0,earlyRebateBps:0},"Choose fixed or percentage early rebate"],
      [{earlyRebateAmount:0,earlyRebateBps:10001},"Early percentage exceeds 100 percent"],
      [{earlyRebateAmount:amount(101)},"Early fixed amount exceeds first price"],
      [{earlyRebateEnabled:false},"Disabled early rebate must be zero"],
      [{inventoryLimit:1},"Account limit exceeds inventory"],
      [{maxPerAccount:1,inventoryLimit:1},"Tier threshold exceeds inventory"],
    ] as const)await expect(hub.createCampaign({...terms,...override},tiers)).to.be.revertedWith(reason);
    await expect(hub.createCampaign(terms,[{threshold:2,price:amount(100)},{threshold:3,price:amount(20)}])).to.be.revertedWith("First threshold must be 1");
    await hub.createCampaign({...terms,earlyRebateAmount:0,earlyRebateBps:10000},tiers);
  });
  it("matches an independent first-unit cost model across 256 reproducible amount/quantity boundaries",async()=>{
    const harness=await (await ethers.getContractFactory("RebateV2Harness")).deploy();let seed=0x79b1n;
    expect(await harness.earlyValue(0,10000,ethers.MaxUint256)).to.equal(ethers.MaxUint256);
    expect(await harness.earlyValue(0,9999,ethers.MaxUint256)).to.equal(ethers.MaxUint256*9999n/10000n);
    const next=()=>{seed=(seed*1103515245n+12345n)%2147483648n;return seed;};
    for(let i=0;i<256;i++) {
      const locked=1n+next()%100000001n,clearing=next()%(locked+1n),quantity=1n+next()%100n,early=next()%(locked*2n+1n),gross=locked*quantity;
      const firstUnitCost=clearing>early?clearing-early:0n;
      const sellerCost=firstUnitCost+clearing*(quantity-1n),expected=gross-sellerCost;
      const rebate=await harness.calculate(locked,clearing,quantity,early,gross);
      expect(rebate).to.equal(expected);expect(rebate).to.be.at.most(gross);
      expect(gross-rebate).to.be.at.least(clearing*(quantity-1n));
    }
  });
});
