using System;
using System.Collections.Generic;
using System.Web.Script.Serialization;
namespace Dir3com.ApprovedSuccessor {
 // Strict JSON syntax also rejects duplicate keys, including escaped aliases.
 internal sealed class JsonSyntax {
  readonly string text;int position;readonly JavaScriptSerializer serializer=new JavaScriptSerializer();
  JsonSyntax(string text){this.text=text;}
  public static void Validate(string text){var p=new JsonSyntax(text);p.Value(0);p.White();if(p.position!=text.Length)throw new FormatException();}
  void White(){while(position<text.Length&&" \t\r\n".IndexOf(text[position])>=0)position++;}
  bool Take(char c){White();if(position<text.Length&&text[position]==c){position++;return true;}return false;}
  void Need(char c){if(!Take(c))throw new FormatException();}
  string String(){White();int start=position;Need('"');bool done=false;while(position<text.Length){char c=text[position++];if(c=='"'){done=true;break;}if(c<32)throw new FormatException();if(c=='\\'){if(position>=text.Length)throw new FormatException();char e=text[position++];if(e=='u'){for(int i=0;i<4;i++){if(position>=text.Length||!Uri.IsHexDigit(text[position++]))throw new FormatException();}}else if("\"\\/bfnrt".IndexOf(e)<0)throw new FormatException();}}if(!done)throw new FormatException();return serializer.Deserialize<string>(text.Substring(start,position-start));}
  void Value(int depth){
   if(depth>20)throw new FormatException();White();if(position>=text.Length)throw new FormatException();char c=text[position];
   if(c=='{'){position++;var keys=new HashSet<string>(StringComparer.Ordinal);if(Take('}'))return;do{string key=String();if(!keys.Add(key))throw new FormatException();Need(':');Value(depth+1);}while(Take(','));Need('}');return;}
   if(c=='['){position++;if(Take(']'))return;do{Value(depth+1);}while(Take(','));Need(']');return;}
   if(c=='"'){String();return;}
   foreach(string literal in new[]{"true","false","null"})if(position+literal.Length<=text.Length&&text.Substring(position,literal.Length)==literal){position+=literal.Length;return;}
   int begin=position;if(c=='-')position++;if(position>=text.Length)throw new FormatException();if(text[position]=='0')position++;else{if(text[position]<'1'||text[position]>'9')throw new FormatException();while(position<text.Length&&text[position]>='0'&&text[position]<='9')position++;}
   if(position<text.Length&&text[position]=='.'){position++;int digits=position;while(position<text.Length&&text[position]>='0'&&text[position]<='9')position++;if(position==digits)throw new FormatException();}
   if(position<text.Length&&(text[position]=='e'||text[position]=='E')){position++;if(position<text.Length&&(text[position]=='+'||text[position]=='-'))position++;int digits=position;while(position<text.Length&&text[position]>='0'&&text[position]<='9')position++;if(position==digits)throw new FormatException();}
   if(position==begin)throw new FormatException();
  }
 }

}
