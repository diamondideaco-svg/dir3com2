using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;

namespace Dir3com.ApprovedSuccessor {
 // The old marker is not a retry permit. This separate approval transition
 // requires that exact parent and a fixed, durable, one-use authorization record.
 internal sealed class ApprovedStore:IApprovalStore {
  readonly string root;
  internal ApprovedStore(){root=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"DIR3COM","Task199");}
#if SYNTHETIC_TESTS
  internal ApprovedStore(string syntheticRoot){root=syntheticRoot;}
#endif
  public IReservation Reserve(){
   FileStream parent=null,grant=null;
   try{
    string path=Path.Combine(root,Scope.ParentName);
    // Read-only hold prohibits parent writes/deletion during the whole attempt.
    parent=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read);
    var expected=Encoding.UTF8.GetBytes(Scope.ParentText);var actual=new byte[expected.Length+1];int read=0,count;
    while(read<actual.Length&&(count=parent.Read(actual,read,actual.Length-read))>0)read+=count;
    if(read!=expected.Length)throw new SafeFailure(Code.ParentMissingOrChanged);
    for(int i=0;i<read;i++)if(actual[i]!=expected[i])throw new SafeFailure(Code.ParentMissingOrChanged);
    if(File.Exists(path+".receipt.json"))throw new SafeFailure(Code.ParentReceiptPresent);
    string grantPath=Path.Combine(root,Scope.GrantName);
    // Same fixed path for this approval in every executable copy/restart.
    grant=new FileStream(grantPath,FileMode.CreateNew,FileAccess.Write,FileShare.Read);
    var header=new Dictionary<string,object>{{"operation","Task199ApprovedInactiveSuccessor"},{"approval",Scope.Approval},{"approval_at_utc",Scope.ApprovalUtc},{"evidence",Scope.Evidence},{"parent",Scope.ParentName},{"parent_status","Unknown preserved; residual risk accepted"},{"project_id",Scope.Project},{"phone_number_id",Scope.Phone},{"callback",Scope.Callback},{"active",false},{"buffer_enabled",false},{"events",Scope.Events()},{"post_may_have_occurred",true},{"retry_allowed",false}};
    Write(grant,new JavaScriptSerializer().Serialize(header));
    var result=new Reservation(parent,grant,grantPath+".receipt.json");parent=null;grant=null;return result;
   }catch(SafeFailure){throw;}
   catch(FileNotFoundException){throw new SafeFailure(Code.ParentMissingOrChanged);}
   catch(DirectoryNotFoundException){throw new SafeFailure(Code.ParentMissingOrChanged);}
   catch{throw new SafeFailure(Code.ApprovalConsumedOrUnavailable);}
   finally{if(grant!=null)grant.Dispose();if(parent!=null)parent.Dispose();}
  }
  internal static void Write(FileStream stream,string safe){var bytes=Encoding.UTF8.GetBytes(safe+"\n");stream.Write(bytes,0,bytes.Length);stream.Flush(true);}
  sealed class Reservation:IReservation {
   readonly FileStream parent,grant;readonly string receipt;bool disposed;
   internal Reservation(FileStream parent,FileStream grant,string receipt){this.parent=parent;this.grant=grant;this.receipt=receipt;}
   public void Record(Diagnostic diagnostic){try{if(disposed)throw new ObjectDisposedException("reservation");Write(grant,diagnostic.Json());}catch{throw new SafeFailure(Code.JournalWriteFailed);}}
   public void SaveReceipt(string safe){using(var file=new FileStream(receipt,FileMode.CreateNew,FileAccess.Write,FileShare.Read)){Write(file,safe);}}
   public void Dispose(){if(disposed)return;disposed=true;try{grant.Dispose();}finally{parent.Dispose();}}
  }
 }
}
