// Local-only audit reproductions. These assertions confirm defects, not acceptance.
// Run from contracts: npx hardhat run ../reports/audit-repro.cjs --no-compile
const { ethers } = require('../contracts/node_modules/hardhat');
const assert = require('node:assert/strict');
const u = (v) => ethers.parseUnits(String(v), 6);
async function main() {
  const [owner, seller, buyer, operator] = await ethers.getSigners();
  const token = await (await ethers.getContractFactory('MockUSDC')).deploy();
  const hub = await (await ethers.getContractFactory('GroupDealHub')).deploy(await token.getAddress(), owner.address, operator.address);
  await token.mint(buyer.address, u(10000));
  await token.connect(buyer).approve(await hub.getAddress(), ethers.MaxUint256);
  const termsHash = ethers.id('audit-only');
  async function campaign(extra = {}) {
    const id = await hub.nextCampaignId();
    await hub.createCampaign({sellerPayoutWallet:seller.address, metric:1, maxPerAccount:10, inventoryLimit:0, durationSeconds:86400, deliverySlaSeconds:86400, earlyRebateEnabled:true, earlySlotsCount:10, earlyRebateAmount:u(10), earlyRebateBps:0, platformFeeBps:0, termsHash, ...extra}, [{threshold:1,price:u(100)},{threshold:2,price:u(80)}]);
    return id;
  }
  async function buy(id, quantity=1) {
    const identity = ethers.id('buyer-' + id);
    const deadline = (await ethers.provider.getBlock('latest')).timestamp + 3600;
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const addr = await hub.getAddress();
    const types = {BuyAuthorization:[['chainId','uint256'],['hubContract','address'],['campaignId','uint256'],['termsHash','bytes32'],['campaignIdentity','bytes32'],['buyerWallet','address'],['nonce','uint256'],['maxQuantity','uint256'],['deadline','uint256']].map(([name,type])=>({name,type}))};
    const signature=await owner.signTypedData({name:'GroupDealHub',version:'1',chainId,verifyingContract:addr},types,{chainId,hubContract:addr,campaignId:id,termsHash,campaignIdentity:identity,buyerWallet:buyer.address,nonce:await hub.identityNonces(id,identity),maxQuantity:10,deadline});
    const oid=await hub.nextOrderId();
    await hub.connect(buyer).commitToBuy(id,identity,quantity,false,10,deadline,signature);
    return oid;
  }
  async function advance(seconds) { await ethers.provider.send('evm_increaseTime',[seconds]); await ethers.provider.send('evm_mine',[]); }
  const c1=await campaign(), o1=await buy(c1);
  await advance(86401); await hub.finalizeCampaign(c1);
  await hub.connect(buyer).claimBuyerFunds(c1,[o1]);
  await advance(86401); await hub.connect(buyer).claimDeliveryBreach(c1,o1);
  await assert.rejects(hub.connect(buyer).claimBuyerFunds(c1,[o1]), /Order already claimed by buyer/);
  assert.equal((await hub.getOrderDetails(o1)).buyerRefundAllocated,u(90));
  console.log('CONFIRMED F03: rebate claimed first; later 90 USDC refund cannot be claimed.');
  const c2=await campaign(), o2=await buy(c2);
  await advance(86401); await hub.finalizeCampaign(c2);
  await hub.connect(seller).recordDelivery(c2,o2,ethers.id('proof'));
  await hub.connect(operator).emergencyCancelCampaign(c2,ethers.id('cancel'));
  await hub.connect(buyer).confirmReceipt(c2,o2);
  const order=await hub.getOrderDetails(o2);
  assert.equal(order.rebateAllocated+order.buyerRefundAllocated+order.sellerAllocated,u(190));
  console.log('CONFIRMED F04: cancelled delivered order allocates 190 USDC against 100 USDC committed.');
  const c3=await campaign({inventoryLimit:2}), o3=await buy(c3,2);
  assert.equal((await hub.campaignStates(c3)).finalClearingPrice,u(80));
  assert.equal((await hub.getOrderDetails(o3)).rebateAllocated,0n);
  console.log('CONFIRMED F05: sold-out final order receives 0 rebate instead of 50 USDC.');
  const c4=await campaign({platformFeeBps:1000,earlyRebateEnabled:false}), o4=await buy(c4);
  await advance(86401); await hub.finalizeCampaign(c4);
  await hub.connect(seller).recordDelivery(c4,o4,ethers.id('proof'));
  await hub.connect(buyer).confirmReceipt(c4,o4);
  await hub.connect(seller).claimSellerProceeds(c4,[o4]);
  assert.equal(await hub.campaignEscrowBalance(c4),u(10));
  console.log('CONFIRMED F07: nonzero fee accepted; 10 USDC remains without a fee claim path.');
  const a={metric:'UNITS_COUNT',tiers:[{threshold:1,price:'100000000'}]};
  const b={metric:'UNITS_COUNT',tiers:[{threshold:999,price:'1'}]};
  assert.equal(JSON.stringify(a,Object.keys(a).sort()),JSON.stringify(b,Object.keys(b).sort()));
  console.log('CONFIRMED F10: canonical serialization ignores nested tier threshold and price.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
