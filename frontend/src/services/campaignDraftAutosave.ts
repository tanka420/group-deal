import { campaignDraftFingerprint } from "./campaignDraftFingerprint";
import { UiError, UiMessage, uiMessage } from "../utils/uiMessage";

export type DraftInput = Record<string, unknown>;
export type SavedDraft = {id:string;version:number;payload:string};
export type DraftWrite = {key:string;input:DraftInput;saved:SavedDraft|null;payload:string};
export type DraftSaveState = {saved:SavedDraft|null;pending:DraftWrite|null;blocked:boolean};
export class DraftWriteError extends UiError {
  constructor(message:UiMessage,public readonly status:number){super(message);}
}

/** Serializes editor writes. A lost response retains the exact request, including its CAS version. */
export class CampaignDraftAutosave {
  state:DraftSaveState={saved:null,pending:null,blocked:false};
  private flight:Promise<SavedDraft>|null=null;
  private active=true;
  constructor(private readonly changed:()=>void,private readonly send:(write:DraftWrite)=>Promise<{id:string;draftVersion:number}>){ }
  restore(state:DraftSaveState){if(this.flight)throw new UiError(uiMessage("Đợi lần lưu đang chạy trước khi mở draft khác.","Wait for the current save before opening another draft."));this.state=structuredClone(state);this.changed();}
  async save(input:DraftInput):Promise<SavedDraft>{
    if(!this.active)throw new UiError(uiMessage("Phiên editor đã đóng; yêu cầu chưa xác nhận được giữ để phục hồi.","The editor is closed; unconfirmed requests are preserved for recovery."));
    if(this.state.blocked)throw new UiError(uiMessage("CONFLICT: autosave đã dừng. Giữ nội dung đang sửa và mở lại phiên bản server để đối chiếu.","CONFLICT: autosave is paused. Keep your edits and reopen the server version for comparison."));
    if(this.flight){await this.flight;return this.save(input);}
    const payload=campaignDraftFingerprint(input);
    if(!this.state.pending&&this.state.saved?.payload===payload)return this.state.saved;
    if(!this.state.pending){this.state.pending={key:`draft-write:${crypto.randomUUID()}`,input:structuredClone(input),saved:this.state.saved?{...this.state.saved}:null,payload};this.changed();}
    const write=this.state.pending;
    const operation=async()=>{
      try{
        const result=await this.send(write);
        if(typeof result.id!=="string"||!Number.isSafeInteger(result.draftVersion)||result.draftVersion<1||(write.saved&&(result.id!==write.saved.id||result.draftVersion!==write.saved.version+1)))throw new UiError(uiMessage("Phản hồi lưu không khớp phiên bản; giữ yêu cầu để kiểm tra lại.","The save response does not match the version. Keep this request for recovery."));
        const saved={id:result.id,version:result.draftVersion,payload:write.payload};this.state={saved,pending:null,blocked:false};this.changed();return saved;
      }catch(error){
        // Definitive rejection is distinct from an unknown commit outcome.
        if(error instanceof DraftWriteError&&[400,401,403,404,409,422].includes(error.status)){
          this.state.pending=null;this.state.blocked=[404,409].includes(error.status);this.changed();
        }
        throw error;
      }
    };
    this.flight=operation();
    try{await this.flight;}finally{this.flight=null;}
    // New typing during an unknown write is applied only after that exact write is acknowledged.
    if(this.state.saved?.payload!==payload)return this.save(input);
    return this.state.saved!;
  }
  get writing(){return this.flight!==null;}
  close(){this.active=false;}
  activate(){this.active=true;}
}
