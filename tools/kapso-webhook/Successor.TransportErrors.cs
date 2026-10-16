using System;
using System.ComponentModel;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Security.Authentication;

namespace Dir3com.ApprovedSuccessor {
 internal static class TransportErrors {
  // Inspect bounded exception types/enums only. Never messages, Data, headers,
  // responses, native free text, stack traces or credential-bearing objects.
  internal static Code Classify(Exception error){
   Code best=Code.TransportFailure;int rank=-1;
   for(int depth=0;error!=null&&depth<8;depth++,error=error.InnerException){
    Code candidate=Code.TransportFailure;int priority=-1;
    var socket=error as SocketException;var web=error as WebException;
    if(error is OperationCanceledException||error is TimeoutException){candidate=Code.Timeout;priority=8;}
    else if(web!=null){
     switch(web.Status){
      case WebExceptionStatus.NameResolutionFailure:candidate=Code.DnsResolutionFailure;priority=6;break;
      case WebExceptionStatus.ProxyNameResolutionFailure:candidate=Code.ProxyResolutionFailure;priority=6;break;
      case WebExceptionStatus.TrustFailure:candidate=Code.TlsCertificateFailure;priority=7;break;
      case WebExceptionStatus.SecureChannelFailure:candidate=Code.TlsHandshakeFailure;priority=6;break;
      case WebExceptionStatus.Timeout:candidate=Code.Timeout;priority=8;break;
      case WebExceptionStatus.ConnectFailure:candidate=Code.ConnectionFailure;priority=3;break;
     }
    }
    else if(socket!=null){
     priority=5;
     switch(socket.SocketErrorCode){
      case SocketError.HostNotFound:case SocketError.NoData:case SocketError.TryAgain:candidate=Code.DnsResolutionFailure;priority=6;break;
      case SocketError.ConnectionRefused:candidate=Code.ConnectionRefused;break;
      case SocketError.ConnectionReset:case SocketError.ConnectionAborted:candidate=Code.ConnectionReset;break;
      case SocketError.NetworkUnreachable:case SocketError.HostUnreachable:candidate=Code.NetworkUnreachable;break;
      case SocketError.AccessDenied:candidate=Code.NetworkAccessDenied;break;
      case SocketError.TimedOut:candidate=Code.Timeout;priority=8;break;
      default:candidate=Code.SocketFailure;break;
     }
    }
    else if(error is AuthenticationException){candidate=Code.TlsAuthenticationFailure;priority=4;}
    else if(error is NotSupportedException){candidate=Code.UnsupportedOperation;priority=2;}
    else if(error is Win32Exception){candidate=Code.NativeTransportFailure;priority=1;}
    else if(error is IOException){candidate=Code.IoFailure;priority=0;}
    if(priority>rank){best=candidate;rank=priority;}
   }
   return best;
  }
 }
}
