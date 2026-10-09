import type {ViemAdapter} from '@circle-fin/adapter-viem-v2';
/** CCTP's installed kit requests increaseAllowance. Use the adapter's supported
 * approve action so this bridge sets the exact reviewed allowance; the existing
 * guarded provider still validates token, spender, amount and receipt. */
export function configureBridgeAdapter<T extends ViemAdapter<any>>(adapter:T):T{
 adapter.actionRegistry.registerHandler('usdc.increaseAllowance',(params,context)=>adapter.actionRegistry.executeAction('usdc.approve',params,context));
 return adapter;
}
