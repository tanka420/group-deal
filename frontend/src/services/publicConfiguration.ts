import {ARC_IS_MAINNET} from '../../../shared/network.mjs';
import mainnet from '../../../shared/mainnet-public.json';

// Explicit environment values, including an empty value, take precedence so
// isolated fixtures can disable providers without contacting a live project.
export const CIRCLE_APP_ID: string = import.meta.env?.VITE_CIRCLE_APP_ID ?? (ARC_IS_MAINNET ? mainnet.circleAppId : '');
export const REOWN_PROJECT_ID: string = import.meta.env?.VITE_REOWN_PROJECT_ID ?? (ARC_IS_MAINNET ? mainnet.reownProjectId : '');
