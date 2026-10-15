using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

namespace Dir3com.ApprovedSuccessor {
 // Trusted operator input, never a browser/customer payload. A pin binds the
 // independently reviewed record; possession of a URI or HTTP200 proves nothing.
 // The approval/pin must be established separately before any live adoption.
 internal sealed class IdentityEvidence {
  internal readonly Guid InternalId;readonly DateTimeOffset verified,expires;
  IdentityEvidence(Guid internalId,DateTimeOffset verified,DateTimeOffset expires){InternalId=internalId;this.verified=verified;this.expires=expires;}
  internal bool IsCurrent(DateTimeOffset now){return verified<=now&&expires>now&&expires<=verified.AddHours(24);}
  internal static IdentityEvidence FromPinnedRecord(string record,string approvedRecordSha256,string approvedPolicyReference,DateTimeOffset now){
   try{
    if(record==null||record.Length>4096||approvedRecordSha256==null||!Regex.IsMatch(approvedRecordSha256,"^[0-9a-f]{64}$")
     ||approvedPolicyReference==null||!Regex.IsMatch(approvedPolicyReference,"^[A-Za-z0-9:_-]{8,120}$")||approvedPolicyReference==Scope.Approval)return null;
    string digest;using(var hash=SHA256.Create())digest=BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(record))).Replace("-","").ToLowerInvariant();
    if(!String.Equals(digest,approvedRecordSha256,StringComparison.Ordinal))return null;
    JsonSyntax.Validate(record);var d=new JavaScriptSerializer{MaxJsonLength=4096,RecursionLimit=10}.DeserializeObject(record) as Dictionary<string,object>;
    var keys=new HashSet<string>(new[]{"source_kind","project_id","phone_number_id","internal_id","evidence_reference","policy_approval_reference","verified_at","expires_at"});
    if(d==null||d.Count!=keys.Count||d.Keys.Any(k=>!keys.Contains(k)))return null;
    foreach(var value in d.Values)if(!(value is string))return null;
    Guid internalId;DateTimeOffset verified,expires;
    if((string)d["source_kind"]!="independent_verified_record"||(string)d["project_id"]!=Scope.Project||(string)d["phone_number_id"]!=Scope.Phone
     ||(string)d["policy_approval_reference"]!=approvedPolicyReference||!Guid.TryParse((string)d["internal_id"],out internalId)||internalId==Guid.Empty
     ||!Regex.IsMatch((string)d["evidence_reference"],"^https://github\\.com/diamondideaco-svg/dir3com2/issues/199#issuecomment-[0-9]{1,20}$")
     ||!Regex.IsMatch((string)d["verified_at"],@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$")
     ||!Regex.IsMatch((string)d["expires_at"],@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})$")
     ||!DateTimeOffset.TryParse((string)d["verified_at"],CultureInfo.InvariantCulture,DateTimeStyles.None,out verified)
     ||!DateTimeOffset.TryParse((string)d["expires_at"],CultureInfo.InvariantCulture,DateTimeStyles.None,out expires))return null;
    var evidence=new IdentityEvidence(internalId,verified,expires);return evidence.IsCurrent(now)?evidence:null;
   }catch{return null;}
  }
 }
}
