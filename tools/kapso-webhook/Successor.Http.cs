using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Security.Authentication;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace Dir3com.ApprovedSuccessor {
 internal sealed class ApprovedHttp:ITransport {
  readonly HttpClient client;
  internal static void ConfigureTls12(Action<SslProtocols> setProtocol){try{setProtocol(SslProtocols.Tls12);}catch(NotSupportedException){throw new SafeFailure(Code.ProtocolConfigurationFailure);}}
  internal static HttpClientHandler CreateDefaultHandler(){var handler=new HttpClientHandler{AllowAutoRedirect=false,UseCookies=false};try{ConfigureTls12(protocol=>handler.SslProtocols=protocol);return handler;}catch{handler.Dispose();throw;}}
  internal ApprovedHttp():this(CreateDefaultHandler()){}
  internal ApprovedHttp(HttpMessageHandler handler){client=new HttpClient(handler);client.Timeout=TimeSpan.FromSeconds(30);}
  public Reply ReadPhone(string key){return Send(Scope.PhoneIdentity,key,null);}
  public Reply ReadList(string key,int page){if(page<1||page>20)throw new SafeFailure(Code.PaginationUnproven);return Send(Scope.Webhooks+"?page="+page.ToString(System.Globalization.CultureInfo.InvariantCulture)+"&per_page=100",key,null);}
  public Reply CreateInactive(string key,string secret){
   var hook=new Dictionary<string,object>{{"kind","kapso"},{"payload_version","v2"},{"url",Scope.Callback},{"events",Scope.Events()},{"active",false},{"buffer_enabled",false},{"secret_key",secret}};
   return Send(Scope.Webhooks,key,new JavaScriptSerializer().Serialize(new Dictionary<string,object>{{"whatsapp_webhook",hook}}));
  }
  Reply Send(string url,string key,string body){
   int? status=null;
   try{
    bool post=body!=null;
    bool fixedPage=false;for(int page=1;page<=20;page++)if(url==Scope.Webhooks+"?page="+page.ToString(System.Globalization.CultureInfo.InvariantCulture)+"&per_page=100")fixedPage=true;
    if(post?url!=Scope.Webhooks:(url!=Scope.PhoneIdentity&&!fixedPage))throw new SafeFailure(Code.TransportFailure);
    using(var request=new HttpRequestMessage(post?HttpMethod.Post:HttpMethod.Get,url)){
     try{request.Headers.Add("X-API-Key",key);}catch(FormatException){throw new SafeFailure(Code.RequestHeaderRejected);}catch(ArgumentException){throw new SafeFailure(Code.RequestHeaderRejected);}
     if(post)request.Content=new StringContent(body,Encoding.UTF8,"application/json");
     using(var response=client.SendAsync(request,HttpCompletionOption.ResponseHeadersRead).GetAwaiter().GetResult()){
      status=(int)response.StatusCode;
      if(status!=(post?201:200))return new Reply(status.Value,new byte[0]);
      if(response.Content==null||response.Content.Headers.ContentType==null||!String.Equals(response.Content.Headers.ContentType.MediaType,"application/json",StringComparison.OrdinalIgnoreCase))throw new SafeFailure(Code.ContentTypeRejected,status);
      using(var input=response.Content.ReadAsStreamAsync().GetAwaiter().GetResult())
      using(var buffer=new MemoryStream())
      using(var deadline=new CancellationTokenSource(TimeSpan.FromSeconds(30))){
       var bytes=new byte[4096];int count;
       while((count=input.ReadAsync(bytes,0,bytes.Length,deadline.Token).GetAwaiter().GetResult())>0){if(buffer.Length+count>65536)throw new SafeFailure(Code.BodyTooLarge,status);buffer.Write(bytes,0,count);}
       return new Reply(status.Value,buffer.ToArray());
      }
     }
    }
   }catch(SafeFailure){throw;}catch(Exception error){throw new SafeFailure(TransportErrors.Classify(error),status);}
  }
  public void Dispose(){client.Dispose();}
 }
}
