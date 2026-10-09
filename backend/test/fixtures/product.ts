import {randomUUID} from 'node:crypto';
import {enrollFixtureOperator} from '../helpers/operatorFixture';
import {AuthService} from '../../src/services/authService';
import {config} from '../../src/config';
import { store } from "../../src/db/store";
import { ProductService } from "../../src/services/productService";

export const productInput={title:"Licensed resource fixture",description:"Actual test resource",category:"Software",vendor:"Fixture",thumbnailUrl:"https://fixture.invalid/thumbnail.png",media:[],requirements:["PDF reader"],supportPolicy:"30 days support",license:{edition:"Individual",seatsPerUnit:1,usageScope:"PERSONAL",durationDays:null,activationWindowDays:30,regions:["Worldwide"],transferable:false,supportDays:30,usageTerms:"Individual usage; redistribution prohibited"}};
/** Positive review fixture exercises actual controller enrollment and consumed step-up. */
export async function reviewedProductVerified(sellerId:string,payoutWallet:string) {
  store.db.users[sellerId]={id:sellerId,email:`${sellerId}@fixture.invalid`,createdAt:0,activeWallet:payoutWallet,roles:["seller","buyer"],sellerProfile:{displayName:"Fixture seller",bio:"Fixture",payoutWallet,payoutProofSignature:"fixture-test-only",verifiedSellerBadge:true,verifiedRightsBadge:false}} as any;
  const operatorId="fixture-rights-reviewer-"+randomUUID();
  store.db.users[operatorId]={id:operatorId,email:`${operatorId}@fixture.invalid`,createdAt:0,activeWallet:null,roles:["operator"]};
  store.save();
  const enrollment=await enrollFixtureOperator(operatorId,undefined,{chainId:config.arcChainId});
  const product=ProductService.createVersion(sellerId,productInput);
  const rights=ProductService.submitRights(sellerId,product.version.id,{declaration:"OWNER",declarationText:"Fixture rights evidence",evidenceRefs:["https://fixture.invalid/private-evidence"]});
  const challenge=AuthService.issueWalletChallenge(operatorId,'OPERATOR_ACTION',enrollment.wallet.address,undefined,undefined,enrollment.proof);
  ProductService.reviewRights(operatorId,rights.id,{decision:"APPROVED",reason:"Test-only independent review",validUntil:Math.floor(Date.now()/1000)+60*86400},{proof:enrollment.proof,stepUp:{walletAddress:enrollment.wallet.address,signature:await enrollment.wallet.signMessage(challenge.challengeMessage),challengeMessage:challenge.challengeMessage}});
  return {product:store.db.products[product.product.id],version:store.db.productVersions[product.version.id],license:store.db.licenseVersions[product.license.id],rights:store.db.rights[rights.id],reviewRights:async (input:Parameters<typeof ProductService.reviewRights>[2])=>{await enrollment.service.authorize(enrollment.proof);const challenge=AuthService.issueWalletChallenge(operatorId,'OPERATOR_ACTION',enrollment.wallet.address,undefined,undefined,enrollment.proof);return ProductService.reviewRights(operatorId,rights.id,input,{proof:enrollment.proof,stepUp:{walletAddress:enrollment.wallet.address,signature:await enrollment.wallet.signMessage(challenge.challengeMessage),challengeMessage:challenge.challengeMessage}});},snapshot:ProductService.snapshot(sellerId,product.version.id,Math.floor(Date.now()/1000)+40*86400)};
}
