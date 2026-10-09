import type {Request,Response} from 'express';
import {config} from '../config';
/** Liveness has no DB/provider side effects and never establishes financial health. */
export function publicHealth(_req:Request,res:Response){res.set('Cache-Control','no-store').json({status:'OK',scope:'PROCESS_LIVENESS_ONLY',financialAccountingVerified:false,service:'GroupDeal API',network:config.arcChainId===5042002?'Arc Testnet (5042002)':'Configured development network',chainId:config.arcChainId,protocolVersion:config.protocolVersion,hubAddress:config.hubAddress,usdcAddress:config.usdcAddress,dependencies:{circleWalletsConfigured:Boolean(config.circleApiKey),transactionalEmailConfigured:Boolean(config.smtpConfigured||(config.emailProviderUrl&&config.emailProviderToken))},timestamp:Date.now()});}
