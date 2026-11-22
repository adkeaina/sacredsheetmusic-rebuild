import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { mkdir,writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
await mkdir('public/fixtures',{recursive:true});
const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.TimesRoman);const bold=await pdf.embedFont(StandardFonts.TimesRomanBold);
let svg='<svg xmlns="http://www.w3.org/2000/svg" width="612" height="792" viewBox="0 0 612 792"><rect width="612" height="792" fill="white"/><text x="306" y="72" text-anchor="middle" font-family="Georgia,serif" font-size="25" fill="#2d2925">A Simple Melody</text><text x="306" y="99" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="#777">ORIGINAL DEMONSTRATION SCORE</text>';
for(let pageNumber=1;pageNumber<=2;pageNumber++){
 const page=pdf.addPage([612,792]);page.drawText('A Simple Melody',{x:205,y:720,size:25,font:bold});page.drawText('Original demonstration score - sample content',{x:172,y:695,size:11,font});
 page.drawText('A short original notation exercise. Not a score for the catalog title.',{x:112,y:667,size:10,font});
 for(let system=0;system<4;system++){
  const y=610-system*120;for(let line=0;line<5;line++){page.drawLine({start:{x:65,y:y-line*8},end:{x:547,y:y-line*8},thickness:0.65,color:rgb(.25,.25,.25)});if(pageNumber===1)svg+=`<line x1="65" y1="${792-y+line*8}" x2="547" y2="${792-y+line*8}" stroke="#333" stroke-width=".7"/>`;}
  for(let measure=0;measure<4;measure++){const x=65+measure*120;page.drawLine({start:{x,y:y+1},end:{x,y:y-33},thickness:0.6});if(pageNumber===1)svg+=`<line x1="${x}" y1="${792-y-1}" x2="${x}" y2="${792-y+33}" stroke="#333" stroke-width=".7"/>`;}
  for(let n=0;n<12;n++){const x=88+n*38;const ny=y-32+[0,8,16,8,4,12,20,12,8,16,12,0][n];page.drawEllipse({x,y:ny,xScale:4.5,yScale:3,color:rgb(.12,.12,.12),rotate:degrees(-15)});page.drawLine({start:{x:x+4,y:ny},end:{x:x+4,y:ny+25},thickness:1});if(pageNumber===1)svg+=`<ellipse cx="${x}" cy="${792-ny}" rx="4.8" ry="3.2" transform="rotate(-15 ${x} ${792-ny})" fill="#222"/><line x1="${x+4}" y1="${792-ny}" x2="${x+4}" y2="${792-ny-25}" stroke="#222"/>`;}
  page.drawText('Sample notation for preview and print testing',{x:140,y:y-58,size:10,font});if(pageNumber===1)svg+=`<text x="140" y="${792-y+58}" font-family="Georgia,serif" font-size="10" fill="#777">Sample notation for preview and print testing</text>`;
 }
 page.drawText('Created for this independent preview. No original-site music has been copied.',{x:100,y:65,size:10,font});page.drawText(String(pageNumber),{x:302,y:40,size:10,font});
}
svg+='<text x="306" y="736" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" fill="#888">Independent preview - sample notation, not original-site repertoire</text></svg>';
await writeFile('public/fixtures/score.svg',svg);await writeFile('public/fixtures/sample.pdf',await pdf.save());
const sampleRate=22050;const duration=8;const samples=sampleRate*duration;const wav=Buffer.alloc(44+samples*2);wav.write('RIFF');wav.writeUInt32LE(36+samples*2,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(sampleRate,24);wav.writeUInt32LE(sampleRate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);const frequencies=[261.63,329.63,392,329.63,293.66,349.23,440,261.63];for(let i=0;i<samples;i++){const t=i/sampleRate;const phase=t%1;const f=frequencies[Math.floor(t)];const envelope=Math.min(1,phase*20)*Math.exp(-phase*4);wav.writeInt16LE(Math.round(6500*envelope*(Math.sin(2*Math.PI*f*t)+.2*Math.sin(4*Math.PI*f*t))),44+i*2);}await writeFile('public/fixtures/sample.wav',wav);
execFileSync('ffmpeg',['-y','-loglevel','error','-i','public/fixtures/sample.wav','-codec:a','libmp3lame','-q:a','6','public/fixtures/sample.mp3']);
await writeFile('public/fixtures/sample.mid',Buffer.from([77,84,104,100,0,0,0,6,0,0,0,1,0,96,77,84,114,107,0,0,0,12,0,144,60,80,96,128,60,0,0,255,47,0]));
console.log('Generated original two-page PDF, SVG, WAV, MP3 and MIDI fixtures.');
