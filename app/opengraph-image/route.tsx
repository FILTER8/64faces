import { ImageResponse } from "next/og";
export const alt = "64 FACES — On-chain arcade identities";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
const rows = [0b00111100,0b01000010,0b10100101,0b10000001,0b10100101,0b10011001,0b01000010,0b00111100];
export async function GET() {
  return new ImageResponse(
    <div style={{ display:"flex", width:"100%", height:"100%", background:"#000", color:"#CCFF00", padding:64, alignItems:"center", justifyContent:"space-between", fontFamily:"monospace", border:"12px solid #CCFF00" }}>
      <div style={{ display:"flex", flexDirection:"column", gap:24 }}><div style={{fontSize:104,fontWeight:800,letterSpacing:-6,lineHeight:0.95}}>64<br/>FACES.</div><div style={{fontSize:30}}>OWN A FACE. PLAY FACE64.</div><div style={{fontSize:21}}>FULLY ON-CHAIN · ROBINHOOD CHAIN</div><div style={{fontSize:20,marginTop:30}}>64FACES.FILTER8.XYZ</div></div>
      <div style={{ display:"flex", width:380,height:380,border:"6px solid #CCFF00",padding:22 }}><div style={{display:"flex", flexWrap:"wrap", width:"100%",height:"100%"}}>{rows.flatMap((r,y)=>Array.from({length:8},(_,x)=><div key={`${y}-${x}`} style={{width:"12.5%",height:"12.5%",background:(r&(128>>x))?"#CCFF00":"#000"}}/>))}</div></div>
    </div>, size);
}
