import Phaser from 'phaser';
import {fullTurn,ringAngle,ringBands,ringCenter,ringSize,type RingModel} from './ring-model';

function drawRing(graphics:Phaser.GameObjects.Graphics,model:RingModel){
 const bands=ringBands(model),track=model.dark?0x34423d:0xe7eeeb;
 graphics.clear();
 if(model.kind!=='infographic'||model.slices.length===0){
  for(const band of bands)graphics.lineStyle(band.width,track).strokeCircle(ringCenter,ringCenter,band.radius);
 }
 for(const slice of model.slices){
  if(slice.to<=slice.from)continue;
  const band=bands[slice.lane];
  graphics.lineStyle(band.width,Phaser.Display.Color.HexStringToColor(slice.color).color);
  if(slice.to-slice.from>=1){
   graphics.strokeCircle(ringCenter,ringCenter,band.radius);
  }else{
   graphics.beginPath().arc(ringCenter,ringCenter,band.radius,ringAngle(slice.from),ringAngle(slice.to)).strokePath();
  }
 }
 if(model.kind!=='clock')return;
 for(let hour=0;hour<24;hour++){
  const angle=hour*fullTurn/24-Math.PI/2;
  const major=hour%3===0,inside=major?200:203,outside=209;
  graphics.lineStyle(major?2:1,model.dark?0x87948e:0xbac9c3);
  graphics.lineBetween(ringCenter+Math.cos(angle)*inside,ringCenter+Math.sin(angle)*inside,
   ringCenter+Math.cos(angle)*outside,ringCenter+Math.sin(angle)*outside);
 }
 if(model.now!==undefined){
  const angle=ringAngle(model.now),x=Math.cos(angle),y=Math.sin(angle);
  graphics.lineStyle(2,0xe35e65);
  graphics.lineBetween(ringCenter+x*181,ringCenter+y*181,ringCenter+x*198,ringCenter+y*198);
  graphics.fillStyle(0xe35e65).fillCircle(ringCenter+x*197,ringCenter+y*197,4);
 }
}

export function startPhaserRing(host:HTMLElement,initial:RingModel,ready:()=>void){
 let model=initial,graphics:Phaser.GameObjects.Graphics|undefined,disposed=false,painted=false;
 const game=new Phaser.Game({
  type:Phaser.CANVAS,width:ringSize,height:ringSize,parent:host,transparent:true,banner:false,
  autoFocus:false,audio:{noAudio:true},input:{keyboard:false,mouse:false,touch:false,gamepad:false},
  scene:{
   create(this:Phaser.Scene){
    if(disposed)return;
    graphics=this.add.graphics();
    drawRing(graphics,model);
    // The ring only needs a frame when its data or theme changes.
    this.game.events.on(Phaser.Core.Events.POST_RENDER,()=>{
     if(disposed)return;
     this.game.loop.sleep();
     if(!painted){painted=true;ready();}
    });
   },
  },
 });
 return {
  update(next:RingModel){
   model=next;
   if(disposed||!graphics)return;
   drawRing(graphics,model);
   game.loop.wake();
  },
  destroy(){
   disposed=true;
   game.destroy(true);
   if(graphics)game.loop.wake();
  },
 };
}
