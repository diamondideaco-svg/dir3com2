#if SYNTHETIC_TESTS
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
namespace Dir3com.ApprovedSuccessor {
 internal static class ContractTests {
  const string Key="SYNTHETIC_API_KEY_00000000000000001",Secret="SYNTHETIC_SIGNING_SECRET_00000000000000001",Internal="00000000-0000-4000-8000-000000000166",Id="00000000-0000-4000-8000-000000000099",Policy="SYNTHETIC-IDENTITY-POLICY";
  static readonly DateTimeOffset Now=DateTimeOffset.Parse("2031-01-01T12:00:00Z");static int checks,scenarios;static JavaScriptSerializer Json{get{return new JavaScriptSerializer();}}
  static void Check(bool value){Interlocked.Increment(ref checks);if(!value)throw new Exception("Synthetic helper assertion");}
  static void Test(Action run){run();scenarios++;}
  static string Record(){return Json.Serialize(new Dictionary<string,object>{{"source_kind","independent_verified_record"},{"project_id",Scope.Project},{"phone_number_id",Scope.Phone},{"internal_id",Internal},{"evidence_reference","https://github.com/diamondideaco-svg/dir3com2/issues/199#issuecomment-9000000000000000000"},{"policy_approval_reference",Policy},{"verified_at",Now.AddHours(-1).ToString("o")},{"expires_at",Now.AddHours(1).ToString("o")}});}
  static string Hash(string text){using(var hash=SHA256.Create())return BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(text))).Replace("-","").ToLowerInvariant();}
  static IdentityEvidence Evidence(string record=null){record=record??Record();return IdentityEvidence.FromPinnedRecord(record,Hash(record),Policy,Now);}
  static Reply R(int status,string body){return new Reply(status,Encoding.UTF8.GetBytes(body));}
  static string Receipt(){return Json.Serialize(new {data=new {id=Id,project_id=Scope.Project,phone_number_id=Scope.Phone,url=Scope.Callback,kind="kapso",payload_version="v2",events=Scope.Events(),active=false,buffer_enabled=false,created_at="2031-01-01T11:59:00Z",updated_at="2031-01-01T11:59:00Z",secret_key=Secret,headers=new{private_value=Key}}});}
  static string List(int page,int per,int pages,int total,object[] rows){return Json.Serialize(new{data=rows,meta=new{page=page,per_page=per,total_pages=pages,total_count=total}});}
  static object Hook(string id,string phone=null){return new{id=id,project_id=Scope.Project,phone_number_id=phone??Scope.Phone,url=Scope.Callback,secret_key=Secret};}
  sealed class Store:IApprovalStore,IReservation {
   int reserved;internal int Saves;internal readonly List<Diagnostic> Events=new List<Diagnostic>();internal bool FailSave;
   public IReservation Reserve(){if(Interlocked.Exchange(ref reserved,1)!=0)throw new SafeFailure(Code.ApprovalConsumedOrUnavailable);return this;}
   public void Record(Diagnostic d){Events.Add(d);var safe=(Dictionary<string,object>)Json.DeserializeObject(d.Json());Check(safe.Count==3&&!d.Json().Contains(Key)&&!d.Json().Contains(Secret));}
   public void SaveReceipt(string safe){if(FailSave)throw new IOException(Secret);Saves++;Check(!safe.Contains(Key)&&!safe.Contains(Secret));var d=(Dictionary<string,object>)Json.DeserializeObject(safe);Check(d.Count==11&&!d.ContainsKey("kind_basis")&&!d.ContainsKey("version_basis")&&!d.ContainsKey("secret_key"));}
   public void Dispose(){}
  }
  sealed class Fake:ITransport {
   internal int PhoneReads,Lists,Posts;internal Reply Phone=R(200,Json.Serialize(new{data=new{phone_number_id=Scope.Phone,internal_id=Internal}})),Created=R(201,Receipt());
   internal Func<int,Reply> Page=p=>R(200,List(p,100,0,0,new object[0]));internal bool LostResponse;
   public Reply ReadPhone(string key){PhoneReads++;return Phone;}
   public Reply ReadList(string key,int page){Lists++;return Page(page);}
   public Reply CreateInactive(string key,string secret){Posts++;if(LostResponse)throw new SafeFailure(Code.Timeout);return Created;}
   public void Dispose(){}
  }
  static Result Run(IApprovalStore s,Fake f,IdentityEvidence e=null){return new HumanAttempt().Run(Key,Secret,true,e??Evidence(),s,f,Now);}
  sealed class Handler:HttpMessageHandler {
   internal int Calls;
   protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,CancellationToken token){Calls++;Check(request.Method==HttpMethod.Post&&request.RequestUri.AbsoluteUri==Scope.Webhooks);Check(request.Headers.GetValues("X-API-Key").Single()==Key);var d=(Dictionary<string,object>)Json.DeserializeObject(request.Content.ReadAsStringAsync().GetAwaiter().GetResult());var hook=(Dictionary<string,object>)d["whatsapp_webhook"];Check(hook.Count==7&&(string)hook["payload_version"]=="v2"&&(string)hook["kind"]=="kapso"&&(bool)hook["active"]==false&&(bool)hook["buffer_enabled"]==false&&!hook.ContainsKey("config_id"));return Task.FromResult(new HttpResponseMessage(HttpStatusCode.Created){Content=new StringContent(Receipt(),Encoding.UTF8,"application/json")});}
  }
  public static int Main(){try{
   Test(()=>{var f=new Fake();var s=new Store();var r=Run(s,f);Check(r.Outcome==Outcome.CreatedInactive&&f.PhoneReads==1&&f.Lists==1&&f.Posts==1&&s.Saves==1);});
   Test(()=>{foreach(var e in new[]{(IdentityEvidence)null,IdentityEvidence.FromPinnedRecord(Record(),new string('0',64),Policy,Now),Evidence(Record().Replace("independent_verified_record","provider_request_context")),Evidence(Record().Replace(Scope.Project,Id)),Evidence(Record().Replace(Scope.Phone,"9999999999999999")),IdentityEvidence.FromPinnedRecord(Record(),Hash(Record()),Scope.Approval,Now)}){var f=new Fake();var r=new HumanAttempt().Run(Key,Secret,true,e,new Store(),f,Now);Check(r.Outcome==Outcome.Blocked&&r.Diagnostic.Code==Code.IdentityEvidenceUnapproved&&f.PhoneReads==0&&f.Posts==0);}});
   Test(()=>{var f=new Fake();var r=new HumanAttempt().Run(Key,Secret,true,Evidence(),new Store(),f,Now.AddHours(2));Check(r.Outcome==Outcome.Blocked&&f.PhoneReads==0);});
   Test(()=>{var f=new Fake{Phone=R(200,Json.Serialize(new{data=new{phone_number_id=Scope.Phone,internal_id=Id}}))};Check(Run(new Store(),f).Diagnostic.Code==Code.PhoneInternalIdMismatch&&f.Lists==0&&f.Posts==0);});
   Test(()=>{var f=new Fake{Page=p=>R(200,List(p,1,2,2,new[]{Hook(p==1?Id:"00000000-0000-4000-8000-000000000098")}))};Check(Run(new Store(),f).Outcome==Outcome.Existing&&f.Lists==2&&f.Posts==0);});
   Test(()=>{foreach(var mode in new[]{"drift","duplicate","foreign","foreign-callback","missing-meta","too-many-pages","bad-count"}){var f=new Fake{Page=p=>{if(mode=="missing-meta")return R(200,"{\"data\":[]}");if(mode=="too-many-pages")return R(200,List(p,1,21,21,new[]{Hook(Id)}));if(mode=="foreign-callback")return R(200,List(p,1,1,1,new[]{Hook(Id)}).Replace(Scope.Callback,"https://other.example.invalid/callback"));if(mode=="foreign")return R(200,List(p,1,1,1,new[]{Hook(Id,"9999999999999")}));if(mode=="bad-count")return R(200,List(p,100,1,1,new object[0]));return R(200,List(p,1,2,mode=="drift"&&p==2?3:2,new[]{Hook(Id)}));}};Check(Run(new Store(),f).Outcome==Outcome.Unknown&&f.Posts==0);}});
   Test(()=>{foreach(var body in new[]{Receipt().Replace("\"kind\":\"kapso\",",""),Receipt().Replace("\"payload_version\":\"v2\",",""),Receipt().Replace("\"payload_version\":\"v2\"","\"payload_version\":\"v1\""),Receipt().Replace("\"active\":false","\"active\":true"),Receipt().Replace("2031-01-01T11:59:00Z","not-an-ISO-date")}){var s=new Store();var f=new Fake{Created=R(201,body)};Check(Run(s,f).Outcome==Outcome.Unknown&&f.Posts==1&&s.Saves==0);}});
   Test(()=>{foreach(var lost in new[]{false,true}){var s=new Store{FailSave=!lost};var f=new Fake{LostResponse=lost};Check(Run(s,f).Outcome==Outcome.Unknown);Check(Run(s,f).Outcome==Outcome.Blocked&&f.Posts==1);}});
   Test(()=>{var handler=new Handler();using(var http=new ApprovedHttp(handler)){Check(http.CreateInactive(Key,Secret).Status==201);}Check(handler.Calls==1);});
   Test(()=>{var fixture=Environment.GetEnvironmentVariable("TASK199_HELPER_FIXTURE_ROOT");Check(fixture!=null&&Path.GetFullPath(fixture).StartsWith(@"D:\DIR3COM-task199-local-validation\",StringComparison.OrdinalIgnoreCase));var root=Path.Combine(fixture,Guid.NewGuid().ToString("N").Substring(0,8));Directory.CreateDirectory(root);var parent=Path.Combine(root,Scope.ParentName);File.WriteAllText(parent,Scope.ParentText,new UTF8Encoding(false));var before=File.ReadAllBytes(parent);var timestamp=File.GetLastWriteTimeUtc(parent);int posts=0;var gate=new ManualResetEventSlim(false);Action work=()=>{gate.Wait();var f=new Fake();Run(new ApprovedStore(root),f);Interlocked.Add(ref posts,f.Posts);};var a=Task.Run(work);var b=Task.Run(work);gate.Set();Task.WaitAll(a,b);Check(posts==1&&File.ReadAllBytes(parent).SequenceEqual(before)&&File.GetLastWriteTimeUtc(parent)==timestamp);var repeat=new Fake();Check(Run(new ApprovedStore(root),repeat).Outcome==Outcome.Blocked&&repeat.Posts==0&&repeat.PhoneReads==0);});
   Console.WriteLine(Json.Serialize(new{status="PASS",scenarios=scenarios,assertions=checks,provider_calls=0,real_marker_access=false,real_secrets_read=false,windows_shown=0}));return 0;
  }catch{Console.WriteLine("FAIL isolated helper contract assertion");return 1;}}
 }
}
#endif
