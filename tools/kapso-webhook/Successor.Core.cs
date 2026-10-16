using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace Dir3com.ApprovedSuccessor {
 internal static class Scope {
  internal const string Approval="Sentinel_4180193c3e4c8191853eabefe42ca372";
  internal const string ApprovalUtc="2026-10-15T18:58:57Z";
  internal const string Evidence="external_api_log:notfound:30days;GET:05a127e3-7da1-4801-b57e-1628fe8f83a4";
  internal const string Project="5414ecf3-199f-4b66-9fac-9ea5233b98ce";
  internal const string Phone="1205896545944230";
  internal const string Callback="https://dir3com.com/api/webhooks/kapso/drive-whatsapp";
  internal const string Base="https://api.kapso.ai/platform/v1/whatsapp";
  internal const string ProjectWitness=Base+"/webhooks?page=1&per_page=1";
  internal const string PhoneIdentity=Base+"/phone_numbers/"+Phone;
  internal const string Webhooks=PhoneIdentity+"/webhooks";
  internal const string List=Webhooks+"?page=1&per_page=100";
  internal const string ParentName="kapso-create-"+Phone+".attempt.json";
  internal const string GrantName="kapso-create-"+Phone+".approved-successor-"+Approval+".jsonl";
  internal const string ParentText="{\"operation\":\"Task199CreateInactiveWebhook\",\"post_may_have_occurred\":true,\"reset_allowed\":false}";
  internal static string[] Events(){return new[]{"whatsapp.message.delivered","whatsapp.message.failed"};}
 }
 internal enum Phase {IdentityEvidence,Input,Reservation,ProjectRequest,ProjectResponse,PhoneRequest,PhoneResponse,ListRequest,ListResponse,ListPagination,CreateIntent,CreateRequest,CreateResponse,Receipt,Complete,TransportSetup}
 internal enum Code {InvalidInput,ConsentRequired,AlreadyChecked,ParentMissingOrChanged,ParentReceiptPresent,ApprovalConsumedOrUnavailable,Reserved,RequestStarted,IdentityVerified,ProjectIdentityUnproven,PhoneIdentityMismatch,PaginationUnproven,PaginationIncomplete,ExistingWebhook,CreateIntentRecorded,CreatedInactive,UnexpectedHttpStatus,InvalidEnvelope,InvalidJson,MetadataRejected,ReceiptWriteFailed,JournalWriteFailed,UnexpectedFailure,TransportFailure,RequestHeaderRejected,ProtocolConfigurationFailure,UnsupportedOperation,DnsResolutionFailure,ProxyResolutionFailure,TlsCertificateFailure,TlsHandshakeFailure,TlsAuthenticationFailure,ConnectionFailure,ConnectionRefused,ConnectionReset,NetworkUnreachable,NetworkAccessDenied,SocketFailure,NativeTransportFailure,IoFailure,Timeout,ContentTypeRejected,BodyTooLarge,
  ProjectDataMissing,ProjectDataNotArray,ProjectWitnessAbsent,ProjectWitnessPageLimitExceeded,ProjectWitnessNotObject,ProjectIdMissing,ProjectIdNotString,ProjectIdEmpty,ProjectIdMismatch,IdentityEvidenceUnapproved,PhoneInternalIdMismatch}
 internal sealed class Diagnostic {
  internal readonly Phase Phase;internal readonly Code Code;internal readonly int? Status;
  internal Diagnostic(Phase phase,Code code,int? status=null){Phase=Enum.IsDefined(typeof(Phase),phase)?phase:Dir3com.ApprovedSuccessor.Phase.Input;Code=Enum.IsDefined(typeof(Code),code)?code:Dir3com.ApprovedSuccessor.Code.UnexpectedFailure;Status=status.HasValue&&status>=100&&status<=599?status:null;}
  internal string Json(){return new JavaScriptSerializer().Serialize(new Dictionary<string,object>{{"phase",Phase.ToString()},{"code",Code.ToString()},{"http_status",Status}});}
  public override string ToString(){return Json();}
 }
 internal sealed class SafeFailure:Exception {
  internal readonly Code Code;internal readonly int? Status;
  internal SafeFailure(Code code,int? status=null):base("Private details suppressed."){Code=Enum.IsDefined(typeof(Code),code)?code:Dir3com.ApprovedSuccessor.Code.UnexpectedFailure;Status=status.HasValue&&status>=100&&status<=599?status:null;}
 }
 internal sealed class Reply {
  internal readonly int Status;internal readonly byte[] Body;
  internal Reply(int status,byte[] body){Status=status;Body=body;}
  public override string ToString(){return "Private response suppressed";}
 }
 internal interface ITransport:IDisposable {
  Reply ReadPhone(string key);Reply ReadList(string key,int page);Reply CreateInactive(string key,string secret);
 }
 internal interface IReservation:IDisposable {void Record(Diagnostic diagnostic);void SaveReceipt(string safeJson);}
 internal interface IApprovalStore {IReservation Reserve();}
 internal enum Outcome {InvalidInput,Blocked,Existing,CreatedInactive,Unknown}
 internal sealed class Result {
  internal readonly Outcome Outcome;internal readonly Diagnostic Diagnostic;internal readonly string SafeJson;
  internal Result(Outcome outcome,Diagnostic diagnostic,string safeJson=null){Outcome=outcome;Diagnostic=diagnostic;SafeJson=safeJson;}
 }
 internal sealed class HumanAttempt {
  int started;
  internal Result Run(string key,string secret,bool consent,IdentityEvidence evidence,IApprovalStore store,ITransport transport,DateTimeOffset now){
   if(Interlocked.CompareExchange(ref started,1,0)!=0)return new Result(Outcome.Blocked,new Diagnostic(Phase.Input,Code.AlreadyChecked));
   return Engine.Run(key,secret,consent,evidence,store,transport,now);
  }
 }
 internal static class Engine {
  static bool Valid(string key,string secret){return key!=null&&secret!=null&&key.Length>=16&&key.Length<=512&&secret.Length>=32&&secret.Length<=512&&!key.Any(Char.IsWhiteSpace)&&!secret.Any(Char.IsWhiteSpace)&&key!=secret;}
  static Dictionary<string,object> Parse(Reply reply,int expected){
   if(reply==null)throw new SafeFailure(Code.InvalidEnvelope);
   if(reply.Status!=expected)throw new SafeFailure(Code.UnexpectedHttpStatus,reply.Status);
   if(reply.Body==null||reply.Body.Length>65536)throw new SafeFailure(Code.BodyTooLarge,reply.Status);
   try{var json=new UTF8Encoding(false,true).GetString(reply.Body);JsonSyntax.Validate(json);var data=new JavaScriptSerializer{MaxJsonLength=65536,RecursionLimit=20}.DeserializeObject(json) as Dictionary<string,object>;if(data==null)throw new SafeFailure(Code.InvalidEnvelope,reply.Status);return data;}
   catch(SafeFailure){throw;}catch{throw new SafeFailure(Code.InvalidJson,reply.Status);}
  }
  static Dictionary<string,object> Object(Dictionary<string,object> owner,string name){object value;if(!owner.TryGetValue(name,out value)||!(value is Dictionary<string,object>))throw new SafeFailure(Code.InvalidEnvelope);return (Dictionary<string,object>)value;}
  static object[] Rows(Dictionary<string,object> owner){object value;if(!owner.TryGetValue("data",out value)||!(value is object[]))throw new SafeFailure(Code.InvalidEnvelope);return (object[])value;}
  static bool Text(Dictionary<string,object> data,string name,string expected){object value;return data.TryGetValue(name,out value)&&value is string&&(string)value==expected;}
  static long Number(Dictionary<string,object> data,string name){object value;if(!data.TryGetValue(name,out value)||(!(value is int)&&!(value is long)))throw new SafeFailure(Code.PaginationUnproven);return Convert.ToInt64(value);}
  static void PhoneIdentity(Dictionary<string,object> data,IdentityEvidence evidence){
   var phone=Object(data,"data");Guid internalId;object value;
   if(!Text(phone,"phone_number_id",Scope.Phone))throw new SafeFailure(Code.PhoneIdentityMismatch);
   if(!phone.TryGetValue("internal_id",out value)||!(value is string)||!Guid.TryParse((string)value,out internalId)||internalId!=evidence.InternalId)throw new SafeFailure(Code.PhoneInternalIdMismatch);
  }
  static bool CompleteList(ITransport transport,string key,IReservation reservation,ref Phase phase,ref int? status){
   long expectedPages=-1,expectedTotal=-1,expectedPer=-1,total=0;var seen=new HashSet<Guid>();
   for(int page=1;page<=20;page++){
    phase=Phase.ListRequest;status=null;reservation.Record(new Diagnostic(phase,Code.RequestStarted));var reply=transport.ReadList(key,page);
    phase=Phase.ListResponse;status=reply==null?(int?)null:reply.Status;var data=Parse(reply,200);phase=Phase.ListPagination;
    if(data.Keys.Any(k=>k!="data"&&k!="meta"))throw new SafeFailure(Code.PaginationUnproven);
    var rows=Rows(data);var meta=Object(data,"meta");
    var allowed=new HashSet<string>(new[]{"page","per_page","total_pages","total_count"});
    if(meta.Keys.Any(k=>!allowed.Contains(k)))throw new SafeFailure(Code.PaginationUnproven);
    long current=Number(meta,"page"),per=Number(meta,"per_page"),pages=Number(meta,"total_pages"),count=Number(meta,"total_count");
    if(current!=page||per<1||per>100||pages<0||pages>20||count<0||count>2000||rows.Length>per
     ||(count==0?pages>1:pages!=(long)Math.Ceiling(count/(double)per)))throw new SafeFailure(Code.PaginationUnproven);
    if(page==1){expectedPages=pages;expectedTotal=count;expectedPer=per;}
    if(pages!=expectedPages||count!=expectedTotal||per!=expectedPer)throw new SafeFailure(Code.PaginationIncomplete);
    foreach(var raw in rows){
     var row=raw as Dictionary<string,object>;object id,url;Guid parsed;
     if(row==null||!Text(row,"project_id",Scope.Project)||!Text(row,"phone_number_id",Scope.Phone)
      ||!row.TryGetValue("id",out id)||!(id is string)||!Guid.TryParse((string)id,out parsed)||parsed==Guid.Empty||!seen.Add(parsed)
      ||!row.TryGetValue("url",out url)||!(url is string)||(string)url!=Scope.Callback)throw new SafeFailure(Code.MetadataRejected);
     // No fields from another callback are emitted or adopted. Any existing row
     // prevents create after the whole bounded snapshot has been checked.
     total++;
    }
    if(page>=Math.Max(1,pages)){
     if(total!=expectedTotal)throw new SafeFailure(Code.PaginationIncomplete);
     return total==0;
    }
    if(rows.Length!=per)throw new SafeFailure(Code.PaginationIncomplete);
   }
   throw new SafeFailure(Code.PaginationIncomplete);
  }
  static string Receipt(Dictionary<string,object> envelope,string key,string secret){
   var d=Object(envelope,"data");object id,active,buffer,events;Guid guid;
   if(!d.TryGetValue("id",out id)||!(id is string)||!Guid.TryParse((string)id,out guid)||guid==Guid.Empty
    ||!Text(d,"project_id",Scope.Project)||!Text(d,"phone_number_id",Scope.Phone)||!Text(d,"url",Scope.Callback)
    ||!d.TryGetValue("active",out active)||!(active is bool)||(bool)active
    ||!d.TryGetValue("buffer_enabled",out buffer)||!(buffer is bool)||(bool)buffer
    ||!d.TryGetValue("events",out events)||!(events is object[]))throw new SafeFailure(Code.MetadataRejected);
   var es=(object[])events;
   if(es.Length!=2||es.Any(value=>!(value is string))||!new HashSet<string>(es.Cast<string>()).SetEquals(Scope.Events()))throw new SafeFailure(Code.MetadataRejected);
   if(!Text(d,"kind","kapso"))throw new SafeFailure(Code.MetadataRejected);
   if(!Text(d,"payload_version","v2"))throw new SafeFailure(Code.MetadataRejected);
   object created,updated;DateTimeOffset createdAt,updatedAt;
   if(!d.TryGetValue("created_at",out created)||!(created is string)||!d.TryGetValue("updated_at",out updated)||!(updated is string)
    ||((string)created).Length>40||((string)updated).Length>40
    ||!System.Text.RegularExpressions.Regex.IsMatch((string)created,@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$")
    ||!System.Text.RegularExpressions.Regex.IsMatch((string)updated,@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$")
    ||!DateTimeOffset.TryParse((string)created,System.Globalization.CultureInfo.InvariantCulture,System.Globalization.DateTimeStyles.None,out createdAt)
    ||!DateTimeOffset.TryParse((string)updated,System.Globalization.CultureInfo.InvariantCulture,System.Globalization.DateTimeStyles.None,out updatedAt)||updatedAt<createdAt)throw new SafeFailure(Code.MetadataRejected);
   var safe=new Dictionary<string,object>{{"id",guid.ToString()},{"project_id",Scope.Project},{"phone_number_id",Scope.Phone},{"url",Scope.Callback},{"active",false},{"buffer_enabled",false},{"events",Scope.Events()},{"kind","kapso"},{"payload_version","v2"},{"created_at",createdAt.ToUniversalTime().ToString("o")},{"updated_at",updatedAt.ToUniversalTime().ToString("o")}};
   foreach(string credential in new[]{key,secret}){
    Guid alias;if(Guid.TryParse(credential,out alias)&&(alias==guid||alias==new Guid(Scope.Project)))throw new SafeFailure(Code.MetadataRejected);
   }
   string json=new JavaScriptSerializer().Serialize(safe);
   if(json.IndexOf(key,StringComparison.OrdinalIgnoreCase)>=0||json.IndexOf(secret,StringComparison.OrdinalIgnoreCase)>=0)throw new SafeFailure(Code.MetadataRejected);
   return json;
  }
  internal static Result Run(string key,string secret,bool consent,IdentityEvidence evidence,IApprovalStore store,ITransport transport,DateTimeOffset now){
   if(!consent)return new Result(Outcome.Blocked,new Diagnostic(Phase.Input,Code.ConsentRequired));
   if(!Valid(key,secret))return new Result(Outcome.InvalidInput,new Diagnostic(Phase.Input,Code.InvalidInput));
   if(evidence==null||!evidence.IsCurrent(now))return new Result(Outcome.Blocked,new Diagnostic(Phase.IdentityEvidence,Code.IdentityEvidenceUnapproved));
   var elapsed=System.Diagnostics.Stopwatch.StartNew();
   Phase phase=Phase.Reservation;int? status=null;IReservation reservation=null;bool existing=false;
   try{
    reservation=store.Reserve();if(reservation==null)throw new SafeFailure(Code.ApprovalConsumedOrUnavailable);
    reservation.Record(new Diagnostic(phase,Code.Reserved));
    phase=Phase.PhoneRequest;reservation.Record(new Diagnostic(phase,Code.RequestStarted));var reply=transport.ReadPhone(key);
    phase=Phase.PhoneResponse;status=reply==null?(int?)null:reply.Status;PhoneIdentity(Parse(reply,200),evidence);reservation.Record(new Diagnostic(phase,Code.IdentityVerified,status));
    if(!CompleteList(transport,key,reservation,ref phase,ref status)){existing=true;reservation.Record(new Diagnostic(phase,Code.ExistingWebhook,status));return new Result(Outcome.Existing,new Diagnostic(phase,Code.ExistingWebhook,status));}
    if(!evidence.IsCurrent(now.Add(elapsed.Elapsed)))throw new SafeFailure(Code.IdentityEvidenceUnapproved);
    phase=Phase.CreateIntent;status=null;reservation.Record(new Diagnostic(phase,Code.CreateIntentRecorded));
    phase=Phase.CreateRequest;reservation.Record(new Diagnostic(phase,Code.RequestStarted));reply=transport.CreateInactive(key,secret);
    phase=Phase.CreateResponse;status=reply==null?(int?)null:reply.Status;var receipt=Receipt(Parse(reply,201),key,secret);
    phase=Phase.Receipt;try{reservation.SaveReceipt(receipt);}catch{throw new SafeFailure(Code.ReceiptWriteFailed,status);}
    phase=Phase.Complete;reservation.Record(new Diagnostic(phase,Code.CreatedInactive,status));
    return new Result(Outcome.CreatedInactive,new Diagnostic(phase,Code.CreatedInactive,status),receipt);
   }catch(Exception error){
    var failure=error as SafeFailure;Code code=failure==null?Code.UnexpectedFailure:failure.Code;
    status=failure!=null&&failure.Status.HasValue?failure.Status:status;
    if(status.HasValue){if(phase==Phase.ProjectRequest)phase=Phase.ProjectResponse;else if(phase==Phase.PhoneRequest)phase=Phase.PhoneResponse;else if(phase==Phase.ListRequest)phase=Phase.ListResponse;else if(phase==Phase.CreateRequest)phase=Phase.CreateResponse;}
    var diagnostic=new Diagnostic(phase,code,status);
    if(reservation!=null){try{reservation.Record(diagnostic);}catch{diagnostic=new Diagnostic(phase,Code.JournalWriteFailed,status);}}
    return new Result(reservation==null?Outcome.Blocked:(existing?Outcome.Existing:Outcome.Unknown),diagnostic);
   }finally{if(reservation!=null){try{reservation.Dispose();}catch{/* Cleanup never starts another attempt or exposes a raw failure. */}}}
  }
 }
}
