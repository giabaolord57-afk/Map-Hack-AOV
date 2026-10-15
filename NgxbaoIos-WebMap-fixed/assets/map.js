(()=>{'use strict';
const $=id=>document.getElementById(id),canvas=$('map'),ctx=canvas.getContext('2d');
const asset='./assets/',icons={},portraits=new Map();let catalog={},socket=null,retry=0,room='',frame=null,lastReceived=0,active=true,video=null,pipTimer=0,selected=0,rosterKey='',lastPanel=0,stale=false;
const number=new Intl.NumberFormat('vi-VN');
for(const [key,file] of Object.entries({terrain:'terrain.png',towerEnemy:'tower-red.png',towerAlly:'tower-blue.png',towerBuffEnemy:'tower-buff-red-r8.png',towerBuffAlly:'tower-buff-blue-r8.png',restore:'restore-r8.png',core:'core.png',slayer:'slayer-r7.png',slayerDark:'slayer-dark-r7.png',slayerInfinite:'slayer-infinite-r7.png',dragon:'dragon-r7.png',dragonHoly:'dragon-holy-r7.png',buffBlue:'buff-r7.png',buffRed:'buff-r7.png',camp:'camp-r7.png'})){const img=new Image();img.src=asset+'icons/'+file;icons[key]=img;}
fetch(asset+'hero-catalog.json').then(r=>r.ok?r.json():{}).then(data=>{catalog=data;rosterKey='';updatePanel();}).catch(()=>{});
function status(text){$('status').textContent=text;}
function notice(text){$('notice').textContent=text;$('notice').hidden=!text;}
function name(a){return catalog[a.hero]?.name||'Tướng #'+a.hero;}
function heroURL(a){return asset+'heroes/'+a.hero+'.png';}
function portrait(a){if(!portraits.has(a.hero)){const img=new Image();img.src=heroURL(a);portraits.set(a.hero,img);}return portraits.get(a.hero);}
function ready(img){return img?.complete&&img.naturalWidth>0;}
function parse(buffer){
 const d=new DataView(buffer);if(d.byteLength<32)return null;
 const magic=d.getUint32(0,true),stride=magic===0x31514d53?28:magic===0x32514d53?44:0;if(!stride)return null;
 const n=d.getUint16(4,true),camp=d.getUint8(7),orientation=d.getUint8(28),span=d.getFloat32(24,true),stamp=d.getFloat64(16,true);
 if(n>128||d.byteLength!==32+n*stride||d.getUint8(6)>1||camp>2||orientation>1||d.getUint32(12,true)||!Number.isFinite(stamp)||!Number.isFinite(span)||span<1||span>1000)return null;
 const actors=[];
 for(let i=0;i<n;i++){const p=32+i*stride,a={id:d.getUint32(p,true),hero:d.getUint32(p+4,true),hp:d.getUint32(p+8,true),max:d.getUint32(p+12,true),x:d.getFloat32(p+16,true),y:d.getFloat32(p+20,true),team:d.getUint8(p+24),kind:d.getUint8(p+25)};
  a.flags=d.getUint16(p+26,true);if(!a.id||!a.max||a.max>10000000||a.hp>a.max||!Number.isFinite(a.x)||!Number.isFinite(a.y)||Math.abs(a.x)>4||Math.abs(a.y)>4||a.team>2||a.kind>(stride===44?6:5))return null;
  const allowed=stride===44&&a.kind<=1?6:a.kind===3?1:0;if((a.flags&~allowed)||((a.flags&2)&&!(a.flags&4))||(a.kind===6&&(![19610,50003,19200].includes(a.hero)||![1,2].includes(a.team))))return null;
  a.cooldowns=stride===44?Array.from({length:4},(_,j)=>d.getInt32(p+28+j*4,true)):null;
  if(a.cooldowns?.some(cd=>cd< -1||cd>86400000||(a.kind>1&&cd!==-1)))return null;actors.push(a);
 }
 return {battle:!!d.getUint8(6),camp,orientation,span,seq:d.getUint32(8,true),stamp,actors};
}
function syncURL(){
 const params=new URLSearchParams(location.search);params.delete('room');params.delete('compact');
 if(room)params.set('room',room);if(document.body.classList.contains('compact'))params.set('compact','1');
 history.replaceState(null,'',location.pathname+(params.size?'?'+params.toString():''));
}
function disconnect(){clearTimeout(retry);retry=0;const previous=socket;socket=null;previous?.close();}
function chooseRoom(code,writeURL=true){
 disconnect();room=code.trim().toUpperCase();frame=null;lastReceived=0;selected=0;rosterKey='';stale=false;updatePanel();
 $('room').textContent=room||'—';$('code').value=room;$('latency').textContent='RTT —';$('perspective').textContent='Chờ luồng từ iPhone';notice('');
 if(writeURL)syncURL();if(room)connect(room);else status('Chưa kết nối');renderMap();
}
function connect(code){
 if(!active||code!==room)return;disconnect();status('Đang kết nối…');
 const params=new URLSearchParams(location.search);
 const configuredBase=params.get('wsBase');
 const wsBase=configuredBase ? configuredBase.replace(/\/$/,'')+'/' : ((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws/');
 let wsURL=wsBase+encodeURIComponent(room);
 let ws;try{ws=new WebSocket(wsURL);}catch(err){status('Địa chỉ WebSocket không hợp lệ');notice('Cần cấu hình máy chủ WebSocket tương thích để xem dữ liệu trực tiếp.');return;}socket=ws;ws.binaryType='arraybuffer';
 ws.onopen=()=>{if(socket===ws)status('Chờ iPhone phát map');};
 ws.onmessage=e=>{if(socket!==ws)return;if(typeof e.data==='string'){try{const p=JSON.parse(e.data);if(p.type==='pong'&&Number.isFinite(p.at)){const rt=performance.now()-p.at;$('latency').textContent='RTT '+(rt<1?'<1':Math.round(rt))+' ms';}}catch{}return;}
  const next=parse(e.data);if(!next)return;frame=next;lastReceived=performance.now();stale=false;
  status(next.battle?(next.actors.length?'Đang phát':'Chưa nhận dữ liệu trong trận'):'Đang chờ vào trận');$('perspective').textContent=next.battle?'Góc nhìn Team '+next.camp:'Chờ vào trận';
  if(!selected&&next.battle)selected=next.actors.find(a=>a.kind===1)?.id||next.actors.find(a=>a.kind===0)?.id||0;
  if(performance.now()-lastPanel>100){lastPanel=performance.now();updatePanel();}
 };
 ws.onclose=()=>{if(socket!==ws)return;socket=null;status('Luồng phát đã dừng / phòng chưa mở');frame=null;lastReceived=0;rosterKey='';updatePanel();if(active)retry=setTimeout(()=>{if(room===code&&!socket)connect(code);},2500);};
 ws.onerror=()=>{if(socket===ws)status('Không kết nối được phòng');};
}
function element(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}
function heroImg(a){const img=element('img');img.src=heroURL(a);img.alt=name(a);img.onerror=()=>{img.onerror=null;img.src=asset+'icons/portrait-unknown.svg';};return img;}
function select(id){selected=id;updatePanel();}
function cooldownText(ms){return ms==null||ms<0?'—':ms===0?'Sẵn sàng':Math.ceil(ms/1000)+' s';}
function visionLabel(a){return a.hero===19610?'Ưng trạm · Elsu':a.hero===50003?'Bẫy Nguyệt Vực · Lindis':a.hero===19200?'Mìn định vị · Celica':'';}
function updateAlerts(){
 const live=frame?.battle&&!stale,recalling=live?frame.actors.filter(a=>a.kind<=1&&a.team!==frame.camp&&a.team>0&&(a.flags&6)===6):[];
 const alert=$('recall-alert');alert.hidden=!recalling.length;alert.textContent=recalling.length?'Đang biến về: '+recalling.map(name).join(', '):'';
 const objects=live?frame.actors.filter(a=>a.kind===6&&a.team!==frame.camp):[];
 $('vision-count').textContent=String(objects.length);const list=$('vision-list');list.replaceChildren();
 for(const a of objects){const row=element('div','vision-row');row.append(element('span','vision-type',a.hero===19610?'◉':'◇'),element('span','vision-name',visionLabel(a)));list.append(row);}
 $('vision-panel').hidden=!objects.length;
}
function updatePanel(){
 updateAlerts();
 const heroes=frame?.battle&&!stale?frame.actors.filter(a=>a.kind<=1):[];$('hero-count').textContent=String(heroes.length).padStart(2,'0');
 const key=heroes.map(a=>[a.id,a.hero,a.team].join(':')).join(',');
 if(key!==rosterKey){rosterKey=key;$('roster').replaceChildren();for(const a of heroes){const b=element('button','hero-button'+(a.team===frame.camp?' ally-button':''));b.title=name(a);b.setAttribute('aria-label','Theo dõi '+name(a));b.dataset.actor=String(a.id);b.append(heroImg(a));b.onclick=()=>select(a.id);$('roster').append(b);}}
 for(const b of $('roster').children){const isSelected=Number(b.dataset.actor)===selected;b.classList.toggle('selected',isSelected);b.setAttribute('aria-pressed',String(isSelected));}
 const a=heroes.find(x=>x.id===selected);
 if(!a){$('tracked').replaceChildren(element('p','empty',selected?'Tướng đang theo dõi không còn trong luồng phát.':'Chạm ảnh tướng trên bản đồ để xem HP.'));return;}
 let row=$('tracked').firstElementChild;
 if(!row?.classList.contains('tracked-row')||row.dataset.actor!==String(a.id)){
  row=element('div','tracked-row');row.dataset.actor=String(a.id);const wrap=element('div','portrait-wrap');wrap.append(heroImg(a),element('span','hero-name',name(a)));
  const detail=element('div','tracked-detail');detail.append(element('div','hero-tag'));const line=element('div','hp-line');line.append(element('span','hp-value'),element('strong','hp-percent'));const bar=element('div','hp-bar');bar.append(element('i'));detail.append(line,bar);
  const cds=element('div','cooldown-grid');cds.setAttribute('aria-label','Hồi chiêu của tướng đang theo dõi');
  for(const [j,label] of ['Chiêu 1','Chiêu 2','Chiêu 3','Bổ trợ'].entries()){const cell=element('div','cooldown-cell');cell.append(element('span','cooldown-label',label),element('strong','skill-cd-'+j,'—'));cds.append(cell);}detail.append(cds);
  row.append(wrap,detail);$('tracked').replaceChildren(row);
 }
 const percent=Math.round(a.hp/a.max*100);row.querySelector('.hero-tag').textContent=((a.flags&6)===6?'Đang biến về · ':'')+(a.kind===1?'Người đang phát':a.team===frame.camp?'Đồng minh':'Đối thủ');row.querySelector('.hp-value').textContent=number.format(a.hp)+' / '+number.format(a.max)+' HP';row.querySelector('.hp-percent').textContent=percent+'%';const bar=row.querySelector('.hp-bar i');bar.style.width=percent+'%';bar.classList.toggle('ally-hp',a.team===frame.camp);
 for(let j=0;j<4;j++){const value=a.cooldowns?.[j],cell=row.querySelector('.skill-cd-'+j);cell.textContent=cooldownText(value);cell.classList.toggle('ready',value===0);cell.classList.toggle('unknown',value==null||value<0);cell.title=value==null||value<0?'Chưa có dữ liệu hồi chiêu':'Dữ liệu trực tiếp từ game';}
}
$('join').onsubmit=e=>{e.preventDefault();const code=$('code').value.trim().toUpperCase();if(/^[A-Z0-9]{6}$/.test(code))chooseRoom(code);};
$('reset-room').onclick=()=>{chooseRoom('');$('code').focus();};
$('compact').onclick=()=>{document.body.classList.toggle('compact');$('compact').textContent=document.body.classList.contains('compact')?'Mở rộng':'Thu gọn';syncURL();};
$('expand').onclick=()=>{document.body.classList.remove('compact');$('compact').textContent='Thu gọn';syncURL();};
$('popup').onclick=()=>{notice('');if(!room){notice('Vào phòng trước khi mở cửa sổ nhỏ');return;}if(!window.open('./?room='+room+'&compact=1','solstice-map','popup,width=380,height=455,resizable=yes'))notice('Trình duyệt đang chặn cửa sổ bật lên');};
$('fullscreen').onclick=async()=>{notice('');try{if(document.fullscreenElement){await document.exitFullscreen();return;}if($('map-panel').requestFullscreen)await $('map-panel').requestFullscreen();else{document.body.classList.toggle('compact');$('compact').textContent=document.body.classList.contains('compact')?'Mở rộng':'Thu gọn';}}catch{notice('Không mở được toàn màn hình');}};
function pipState(){return document.pictureInPictureElement===video||video?.webkitPresentationMode==='picture-in-picture';}
function syncPip(){clearInterval(pipTimer);pipTimer=0;$('pip').textContent=pipState()?'Đóng PiP':'PiP';if(pipState())pipTimer=setInterval(renderMap,33);}
function pipVideo(){
 if(video)return video;if(!canvas.captureStream)return null;
 video=document.createElement('video');video.id='pip-video';video.muted=true;video.playsInline=true;video.setAttribute('playsinline','');video.setAttribute('webkit-playsinline','');video.setAttribute('aria-hidden','true');video.tabIndex=-1;
 // Safari needs a mounted, playing video with a decoded frame. Keep one
 // stream across clicks; replacing srcObject can invalidate presentation.
 $('map-panel').append(video);video.srcObject=canvas.captureStream(30);
 for(const event of ['enterpictureinpicture','leavepictureinpicture','webkitpresentationmodechanged'])video.addEventListener(event,syncPip);
 return video;
}
$('pip').onclick=async()=>{notice('');try{
 if(document.pictureInPictureElement===video&&video){await document.exitPictureInPicture();return;}
 if(video?.webkitPresentationMode==='picture-in-picture'){video.webkitSetPresentationMode('inline');syncPip();return;}
 const v=pipVideo();if(!v){notice('Trình duyệt này không tạo được video map để mở PiP.');return;}
 await v.play();
 // Do not gate Safari's API on document.pictureInPictureEnabled: Safari
 // can expose only webkitSetPresentationMode.
 if(v.webkitSupportsPresentationMode?.('picture-in-picture')&&typeof v.webkitSetPresentationMode==='function'){v.webkitSetPresentationMode('picture-in-picture');syncPip();return;}
 if(document.pictureInPictureEnabled&&typeof v.requestPictureInPicture==='function'){await v.requestPictureInPicture();syncPip();return;}
 notice('Safari chưa cho phép PiP với luồng video này. Bạn có thể thử nút PiP lần nữa sau khi map đã chạy.');
}catch(e){notice(e.name==='NotAllowedError'?'Safari yêu cầu chạm nút PiP trực tiếp khi video đã chạy. Bấm PiP lại.':'Trình duyệt không mở được PiP cho luồng map ('+(e.name||'lỗi video')+').');}};
function background(){ctx.fillStyle='#182734';ctx.fillRect(0,0,900,900);if(!ready(icons.terrain))return;ctx.save();if(frame?.camp===2){if(frame.orientation)ctx.transform(-1,0,0,1,900,0);else{ctx.translate(900,900);ctx.rotate(Math.PI);}}
 // The power-of-two texture is 256x256, but the map occupies exactly
 // 244x244. Its transparent right/bottom padding is not playable space.
 // Actor coordinates already describe the game map; only crop the texture.
 ctx.drawImage(icons.terrain,0,0,244,244,0,0,900,900);ctx.restore();}
function imageIcon(img,x,y,w,h,filter='none'){if(!ready(img))return;ctx.save();ctx.filter=filter;ctx.imageSmoothingEnabled=false;ctx.drawImage(img,x-w/2,y-h/2,w,h);ctx.restore();}
function monsterIcon(a){if(a.hero===7010||a.hero===547010)return 'buffBlue';if(a.hero===7011||a.hero===547011)return 'buffRed';if(a.hero===7009)return 'slayer';if(a.hero===70092)return 'slayerDark';if(a.hero===70093)return 'slayerInfinite';if([7024,7012,123,124].includes(a.hero))return 'dragon';if([7001,7006,7007,7008,7013,7031].includes(a.hero))return 'camp';return null;}
function drawActor(a){if(a.x<0||a.x>1||a.y<0||a.y>1)return;const x=a.x*900,y=a.y*900,ally=a.team===frame.camp;
 if(a.kind===6){const color=ally?'#62d6e5':'#f5a577';ctx.save();ctx.fillStyle='#171b29';ctx.strokeStyle=color;ctx.lineWidth=4;ctx.beginPath();ctx.arc(x,y,17,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();
  if(a.hero===19610){ctx.ellipse(x,y,10,6,0,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
  else{ctx.moveTo(x,y-9);ctx.lineTo(x+8,y);ctx.lineTo(x,y+9);ctx.lineTo(x-8,y);ctx.closePath();ctx.stroke();ctx.beginPath();ctx.moveTo(x-4,y-4);ctx.lineTo(x+4,y+4);ctx.moveTo(x+4,y-4);ctx.lineTo(x-4,y+4);ctx.stroke();}ctx.restore();return;}
 if(a.kind===5){imageIcon(icons.restore,x,y,23,23);return;}
 if(a.kind===4){ctx.fillStyle=ally?'#62d6e5':'#f17a83';ctx.strokeStyle='#0d202a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.fill();ctx.stroke();return;}
 // organ.bytes identifies 7509/7519 as high towers; 7510/7520 are crystals.
 if(a.kind===3){const core=[3,4,68,72,7510,7520,3427010,3427020].includes(a.hero);if(core)imageIcon(icons.core,x,y,66,58,ally?'hue-rotate(140deg) saturate(1.2)':'hue-rotate(-45deg) saturate(1.6)');else if(a.flags&1)imageIcon(ally?icons.towerBuffAlly:icons.towerBuffEnemy,x,y,46,50);else imageIcon(ally?icons.towerAlly:icons.towerEnemy,x,y,29,50);return;}
 if(a.kind===2){const kind=monsterIcon(a);if(!kind)return;const epic=kind.startsWith('slayer')||kind.startsWith('dragon'),size=epic?80:kind==='camp'?26:54;imageIcon(icons[kind],x,y,size,size);if(a.hp<a.max){ctx.fillStyle='#16151fcc';ctx.fillRect(x-20,y+size*.42,40,5);ctx.fillStyle='#ddb461';ctx.fillRect(x-20,y+size*.42,40*a.hp/a.max,5);}return;}
 const r=a.id===selected?43:34;ctx.save();ctx.shadowColor='#000';ctx.shadowBlur=5;ctx.fillStyle='#152331';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
 ctx.beginPath();ctx.arc(x,y,r-3,0,Math.PI*2);ctx.clip();const img=portrait(a);if(ready(img))ctx.drawImage(img,x-r,y-r,r*2,r*2);else{ctx.fillStyle=ally?'#53bacc':'#d9717b';ctx.fillRect(x-r,y-r,r*2,r*2);ctx.fillStyle='#ecf0ef';ctx.font='bold 24px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('?',x,y);}ctx.restore();
 ctx.strokeStyle=ally?'#62d6e5':'#f17a83';ctx.lineWidth=5;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#e9d591';ctx.lineWidth=4;ctx.beginPath();ctx.arc(x,y,r+5,-Math.PI/2,-Math.PI/2+Math.PI*2*a.hp/a.max);ctx.stroke();
 if((a.flags&6)===6){ctx.strokeStyle='#bcb0ff';ctx.lineWidth=4;ctx.setLineDash([7,5]);ctx.beginPath();ctx.arc(x,y,r+12,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
}
canvas.onclick=e=>{if(!frame?.battle||stale)return;const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;let nearest=null,distance=Infinity;for(const a of frame.actors){if(a.kind>1)continue;const d=Math.hypot(a.x-x,a.y-y);if(d<distance){nearest=a;distance=d;}}if(nearest&&distance<.07)select(nearest.id);};
function renderMap(){background();const age=lastReceived?performance.now()-lastReceived:Infinity,live=frame?.battle&&age<3000;
 if(live){$('map-message').hidden=frame.actors.length>0;if(!frame.actors.length){$('map-message').textContent='Đã kết nối · Chưa nhận dữ liệu trong trận';ctx.fillStyle='#c0cdd6';ctx.font='24px sans-serif';ctx.textAlign='center';ctx.fillText('Chưa nhận dữ liệu trong trận',450,450);}for(const kind of [3,2,5,4,6,0,1])for(const a of frame.actors)if(a.kind===kind&&a.id!==selected)drawActor(a);const tracked=frame.actors.find(a=>a.id===selected&&a.kind<=1);if(tracked)drawActor(tracked);}
 else{$('map-message').hidden=false;$('map-message').textContent=frame&&!frame.battle?'Chờ người phát vào trận':lastReceived?'Luồng phát đã dừng':room?'Chờ iPhone phát bản đồ':'Nhập mã phòng để xem bản đồ';if(!stale){stale=true;updatePanel();}ctx.fillStyle='#07101a66';ctx.fillRect(0,0,900,900);ctx.fillStyle='#c0cdd6';ctx.font='24px sans-serif';ctx.textAlign='center';ctx.fillText(frame&&!frame.battle?'Chờ vào trận':'Chưa có luồng phát',450,450);}
 $('age').textContent=lastReceived&&age<3000?'Cập nhật '+Math.round(age)+' ms trước':lastReceived?'Luồng phát đã dừng':'Chưa có dữ liệu';
}
function draw(){renderMap();requestAnimationFrame(draw);}
setInterval(()=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'ping',at:performance.now()}));},2000);
addEventListener('pagehide',e=>{active=false;disconnect();clearInterval(pipTimer);if(!e.persisted)video?.srcObject?.getTracks().forEach(t=>t.stop());});
addEventListener('pageshow',()=>{if(!active){active=true;if(room)connect(room);syncPip();}});
function readURL(){const params=new URLSearchParams(location.search);document.body.classList.toggle('compact',params.get('compact')==='1');$('compact').textContent=document.body.classList.contains('compact')?'Mở rộng':'Thu gọn';chooseRoom(/^[A-Za-z0-9]{6}$/.test(params.get('room')||'')?params.get('room'):'',false);}
addEventListener('popstate',readURL);readURL();if(new URLSearchParams(location.search).get('qa')==='1')$('qa-label').hidden=false;draw();
window.HNAOVMapDecoder=window.SolsticeMapDecoder=parse;
window.HNAOVMapMonsterIcon=window.SolsticeMapMonsterIcon=monsterIcon;
window.HNAOVMapCooldownText=window.SolsticeMapCooldownText=cooldownText;
window.HNAOVMapVisionLabel=window.SolsticeMapVisionLabel=visionLabel;
})();
