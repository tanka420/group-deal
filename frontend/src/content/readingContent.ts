export type LocalizedCopy = readonly [vi:string,en:string];
export type ReadingSection = {id:string;title:LocalizedCopy;paragraphs?:LocalizedCopy[];items?:LocalizedCopy[];ordered?:boolean;links?:{href:string;label:LocalizedCopy}[]};
export type ReadingContent = {title:LocalizedCopy;intro:LocalizedCopy;sections:ReadingSection[]};
