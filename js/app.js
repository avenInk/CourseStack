(function(){
'use strict';

/* ========== UTILITIES ========== */
function fmt(s){
  if(!s||isNaN(s))return'0:00';
  var h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=Math.floor(s%60);
  if(h>0)return h+':'+(m<10?'0':'')+m+':'+(sec<10?'0':'')+sec;
  return m+':'+(sec<10?'0':'')+sec;
}
function slug(t){
  return String(t||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
}
function esc(v){
  return String(v==null?'':v).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function attr(v){return esc(v);}
function encodePath(p){
  return '/'+p.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}
function mediaUrl(p){
  return '/?api=file&path='+encodeURIComponent(p);
}
function fileExt(name){
  var i=name.lastIndexOf('.');
  return i>0?name.substring(i).toLowerCase():'';
}
function fileType(name){
  var e=fileExt(name);
  if(['.mp4','.m4v','.webm','.mkv','.ts'].indexOf(e)>=0)return'video';
  if(['.flac','.m4a','.mp3','.ogg','.wav'].indexOf(e)>=0)return'audio';
  if(e==='.pdf')return'pdf';
  if(e==='.txt')return'txt';
  if(['.png','.jpg','.jpeg','.gif','.webp','.svg'].indexOf(e)>=0)return'image';
  return null;
}
function isTransportStream(name){
  return fileExt(name)==='.ts';
}
function formatBytes(bytes){
  if(!bytes)return'0 B';
  var k=1024,sizes=['B','KB','MB','GB'],i=Math.floor(Math.log(bytes)/Math.log(k));
  return parseFloat((bytes/Math.pow(k,i)).toFixed(1))+' '+sizes[i];
}
function cleanTitle(name){
  var e=name.lastIndexOf('.');
  if(e>0)name=name.substring(0,e);
  name=name.replace(/^Copia de\s*/gi,'');
  name=name.replace(/\s*@RecursosCompartidos\s*$/i,'');
  var m=name.match(/^(\d+)[.\s_-]*(.*)$/);
  return m?{order:parseInt(m[1],10),title:m[2]||name}:{order:999,title:name};
}
function clone(obj){
  return JSON.parse(JSON.stringify(obj||{}));
}
function emptyState(){
  return{watched:{},positions:{},current:null,theme:'dark'};
}
function normalizeState(data){
  data=data&&typeof data==='object'?data:{};
  return{
    watched:data.watched&&typeof data.watched==='object'?data.watched:{},
    positions:data.positions&&typeof data.positions==='object'?data.positions:{},
    current:data.current&&typeof data.current==='object'?data.current:null,
    theme:data.theme==='light'?'light':'dark'
  };
}
function mergeStates(a,b){
  var out=normalizeState(a);
  b=normalizeState(b);

  Object.keys(b.watched).forEach(function(k){
    var av=Number(out.watched[k]||0),bv=Number(b.watched[k]||0);
    out.watched[k]=Math.max(av,bv||Date.now());
  });

  Object.keys(b.positions).forEach(function(k){
    var cur=out.positions[k],next=b.positions[k];
    var curTime=cur&&Number(cur.updatedAt||0);
    var nextTime=next&&Number(next.updatedAt||0);
    if(!cur||nextTime>=curTime)out.positions[k]=next;
  });

  if(b.current){
    var at=out.current&&Number(out.current.updatedAt||0);
    var bt=Number(b.current.updatedAt||0);
    if(!out.current||bt>=at)out.current=b.current;
  }
  if(b.theme)out.theme=b.theme;
  return out;
}

/* ========== STORE ========== */
var STORE_KEY='coursetracker_v4';
var LEGACY_STORE_KEY='coursetracker_v3';
var Store={
  data:emptyState(),
  serverAvailable:false,
  saveTimer:null,

  readLocal:function(){
    var merged=emptyState();
    [LEGACY_STORE_KEY,STORE_KEY].forEach(function(key){
      try{
        var s=localStorage.getItem(key);
        if(s)merged=mergeStates(merged,JSON.parse(s));
      }catch(e){}
    });
    return merged;
  },
  persistLocal:function(){
    try{localStorage.setItem(STORE_KEY,JSON.stringify(this.data));}catch(e){}
  },
  load:function(){
    var self=this;
    self.data=mergeStates(self.data,self.readLocal());
    return API.fetchState().then(function(remote){
      self.serverAvailable=true;
      var merged=mergeStates(remote,self.data);
      var needsUpload=JSON.stringify(merged)!==JSON.stringify(normalizeState(remote));
      self.data=merged;
      self.persistLocal();
      if(needsUpload)self.queueSave(80);
    }).catch(function(){
      self.serverAvailable=false;
      self.persistLocal();
    });
  },
  save:function(){
    this.persistLocal();
    this.queueSave();
  },
  queueSave:function(delay){
    var self=this;
    clearTimeout(this.saveTimer);
    this.saveTimer=setTimeout(function(){self.flushSave();},delay==null?350:delay);
  },
  flushSave:function(){
    if(!this.serverAvailable)return Promise.resolve();
    var payload=clone(this.data);
    return API.saveState(payload).catch(function(){});
  },
  isWatched:function(key){return!!this.data.watched[key];},
  setWatched:function(key,val){
    if(val)this.data.watched[key]=Date.now();
    else delete this.data.watched[key];
    this.save();
  },
  toggleWatched:function(key){
    this.setWatched(key,!this.isWatched(key));
    return this.isWatched(key);
  },
  setCurrent:function(info){
    this.data.current=Object.assign({},info,{updatedAt:Date.now()});
    this.save();
  },
  getCurrent:function(){return this.data.current;},
  getTheme:function(){return this.data.theme||'dark';},
  setTheme:function(t){this.data.theme=t;this.save();},
  getPosition:function(path){return this.data.positions[path]||null;},
  setPosition:function(item,time,duration){
    if(!item||!isFinite(time)||time<0)return;
    this.data.positions[item.path]={
      path:item.path,
      title:item.title,
      courseId:State.currentCourse?State.currentCourse.id:null,
      courseName:State.currentCourse?State.currentCourse.name:null,
      blockName:State.currentBlock?State.currentBlock.name:null,
      type:item.type,
      time:Math.max(0,Math.floor(time)),
      duration:isFinite(duration)?Math.floor(duration):0,
      updatedAt:Date.now()
    };
    this.save();
  },
  history:function(limit){
    var list=Object.keys(this.data.positions).map(function(k){return Store.data.positions[k];})
      .filter(function(p){return p&&p.path;})
      .sort(function(a,b){return Number(b.updatedAt||0)-Number(a.updatedAt||0);});
    return list.slice(0,limit||60);
  },
  clear:function(){
    this.data=emptyState();
    this.save();
  }
};

/* ========== API ========== */
var API={
  fetchTree:function(){
    return fetch('/?api=tree').then(function(r){
      if(!r.ok)throw new Error('tree');
      return r.json();
    }).then(function(resp){
      // Support both legacy array and new {tree, prefix} object
      if(Array.isArray(resp))return{tree:resp,prefix:''};
      return resp;
    });
  },
  fetchState:function(){
    return fetch('/?api=state',{cache:'no-store'}).then(function(r){
      if(!r.ok)throw new Error('state');
      return r.json();
    });
  },
  saveState:function(data){
    return fetch('/?api=state',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(data)
    }).then(function(r){
      if(!r.ok)throw new Error('save');
      return r.json();
    });
  }
};

/* ========== COURSE PARSER ========== */
function hasMediaNode(entry){
  if(!entry)return false;
  if(!entry.isDir)return !!fileType(entry.name);
  return (entry.children||[]).some(hasMediaNode);
}
function sortItems(items){
  items.sort(function(a,b){
    var ta=(a.topic||''),tb=(b.topic||'');
    return ta.localeCompare(tb,'es',{numeric:true})||a.order-b.order||a.title.localeCompare(b.title,'es',{numeric:true});
  });
}
function collectDirectItems(children,basePath,topic){
  var items=[],lastMedia=null;
  (children||[]).slice().sort(function(a,b){return a.name.localeCompare(b.name,'es',{numeric:true});}).forEach(function(f){
    if(f.isDir)return;
    var t=fileType(f.name);
    if(t==='video'||t==='audio'){
      var info=cleanTitle(f.name);
      lastMedia={name:f.name,path:basePath+'/'+f.name,type:t,title:info.title,order:info.order,size:f.size||0,topic:topic||'',attachments:[]};
      items.push(lastMedia);
    }else if(t==='pdf'||t==='txt'||t==='image'){
      var att={name:f.name,path:basePath+'/'+f.name,type:t,size:f.size||0};
      if(lastMedia){
        lastMedia.attachments.push(att);
      }else{
        var info2=cleanTitle(f.name);
        items.push({name:f.name,path:basePath+'/'+f.name,type:t,title:info2.title,order:info2.order,size:f.size||0,topic:topic||'',attachments:[]});
      }
    }
  });
  sortItems(items);
  return items;
}
function collectItemsRecursive(dir,basePath,topicParts,items){
  var topic=topicParts.join(' > ');
  collectDirectItems(dir.children,basePath,topic).forEach(function(item){items.push(item);});
  (dir.children||[]).forEach(function(child){
    if(child.isDir){
      collectItemsRecursive(child,basePath+'/'+child.name,topicParts.concat(child.name),items);
    }
  });
}
function buildBlockFromDir(dir,basePath){
  var items=[];
  collectItemsRecursive(dir,basePath,[],items);
  sortItems(items);
  return{name:dir.name,items:items};
}
function parseTree(resp){
  var tree=resp.tree||resp;
  var prefix=resp.prefix||'';
  var courses=[];
  (tree||[]).forEach(function(entry){
    if(entry.isDir&&hasMediaNode(entry)){
      var basePath=prefix?'/'+prefix+'/'+entry.name:'/'+entry.name;
      var course={id:slug((prefix?prefix+'/':'')+entry.name),name:entry.name,blocks:[],totalItems:0};
      // Flatten the entire folder tree into a single list of items with topic breadcrumbs
      var allItems=[];
      collectItemsRecursive(entry,basePath,[],allItems);
      sortItems(allItems);
      // Group by top-level block (direct subfolders)
      var blockMap={};
      var looseItems=[];
      allItems.forEach(function(it){
        // Determine the first-level subfolder relative to the course root
        var rel=it.path.substring(basePath.length+1); // strip leading /course/
        var firstSlash=rel.indexOf('/');
        if(firstSlash>0){
          var blockName=rel.substring(0,firstSlash);
          if(!blockMap[blockName])blockMap[blockName]=[];
          blockMap[blockName].push(it);
        }else{
          looseItems.push(it);
        }
      });
      if(looseItems.length>0){
        sortItems(looseItems);
        course.blocks.unshift({name:'Archivos',items:looseItems});
      }
      Object.keys(blockMap).sort(function(a,b){return a.localeCompare(b,'es',{numeric:true});}).forEach(function(bn){
        var items=blockMap[bn];
        sortItems(items);
        course.blocks.push({name:bn,items:items});
      });
      course.blocks.forEach(function(b){course.totalItems+=b.items.length;});
      if(course.totalItems>0)courses.push(course);
    }
  });
  courses.sort(function(a,b){return a.name.localeCompare(b.name,'es',{numeric:true});});
  return courses;
}

/* ========== APP STATE ========== */
var State={
  courses:[],
  currentItem:null,
  currentCourse:null,
  currentBlock:null,
  blockExpanded:{},
  viewMode:'home'
};

/* ========== SVG ICONS ========== */
var ICO={
  chev:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
  video:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  audio:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>',
  pdf:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/></svg>',
  txt:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 9H7v-2h6v2zm2 4H7v-2h8v2zM13 9V3.5L18.5 9H13z"/></svg>',
  image:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>',
  book:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>',
  folder:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>',
  download:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>'
};

/* ========== UI RENDERING ========== */
var UI={
  switchView:function(mode){
    State.viewMode=mode;
    var home=document.getElementById('homeView');
    var player=document.getElementById('playerView');
    var backBtn=document.getElementById('backBtn');
    var menuBtn=document.getElementById('mobileMenuBtn');

    if(mode==='home'){
      home.style.display='block';
      player.style.display='none';
      backBtn.style.display='none';
      menuBtn.style.display='none';
      this.closeSidebar();
      this.renderHome();
      Player.pause();
    }else{
      home.style.display='none';
      player.style.display='flex';
      backBtn.style.display='flex';
      menuBtn.style.display='flex';
      this.renderSidebar();
    }
  },

  renderHome:function(){
    var grid=document.getElementById('courseGrid');
    if(!grid)return;
    if(State.courses.length===0){
      grid.innerHTML='<div class="empty-inline">No se encontraron cursos.</div>';
      return;
    }

    var h='';
    State.courses.forEach(function(c){
      var watchedCount=0;
      c.blocks.forEach(function(b){b.items.forEach(function(it){if(Store.isWatched(it.path))watchedCount++;});});
      var pct=c.totalItems>0?Math.round(watchedCount/c.totalItems*100):0;
      var last=lastCourseProgress(c);
      h+='<div class="course-card" data-action="open-course" data-id="'+attr(c.id)+'">';
      h+='<div class="course-card-top"><div class="course-card-icon">'+ICO.book+'</div><div class="course-card-progress '+(pct===100?'done':'')+'">'+pct+'%</div></div>';
      h+='<div class="course-card-title">'+esc(c.name)+'</div>';
      h+='<div class="course-card-meta"><span>'+c.totalItems+' lecciones</span><span>'+watchedCount+' completadas</span></div>';
      h+='<div class="course-card-bar"><span style="width:'+pct+'%"></span></div>';
      if(last)h+='<div class="course-card-last">Ultimo: '+esc(last.title)+' · '+fmt(last.time)+'</div>';
      h+='</div>';
    });
    grid.innerHTML=h;
  },

  renderSidebar:function(){
    var el=document.getElementById('courseTree');
    var titleEl=document.getElementById('sidebarCourseTitle');
    var c=State.currentCourse;
    if(!el||!c)return;

    titleEl.textContent=c.name;
    titleEl.title=c.name;

    var html='';
    c.blocks.forEach(function(b){html+=UI.renderBlock(c,b);});
    el.innerHTML=html;
    this.renderStats();
  },

  renderBlock:function(c,b){
    var key=c.id+'/'+b.name;
    var activeBlock=State.currentBlock&&State.currentBlock.name===b.name&&State.currentCourse&&State.currentCourse.id===c.id;
    var isOpen=State.blockExpanded[key]===true||activeBlock;
    var h='<div class="block-head '+(isOpen?'open':'')+'" data-action="toggle-block" data-key="'+attr(key)+'">';
    h+='<span class="block-chevron">'+ICO.chev+'</span>';
    h+='<span class="block-icon">'+ICO.folder+'</span>';
    h+='<span class="block-label" title="'+attr(b.name)+'">'+esc(b.name)+'</span>';
    h+='<span class="block-count">'+b.items.length+'</span>';
    h+='</div>';

    h+='<div class="block-children '+(isOpen?'open':'')+'">';
    var lastTopic=null;
    b.items.forEach(function(it){
      var topic=it.topic||'';
      if(topic&&topic!==lastTopic){
        h+='<div class="topic-head" title="'+attr(topic)+'">'+esc(topic)+'</div>';
        lastTopic=topic;
      }else if(!topic){
        lastTopic=null;
      }
      h+=UI.renderItem(c,b,it);
    });
    h+='</div>';
    return h;
  },

  renderItem:function(c,b,it){
    var watched=Store.isWatched(it.path);
    var active=State.currentItem&&State.currentItem.path===it.path;
    var pos=Store.getPosition(it.path);
    var cls='lesson-row'+(watched?' watched':'')+(active?' active':'');
    var iconClass='lesson-type-icon '+it.type;
    var icon=it.type==='video'?ICO.video:it.type==='audio'?ICO.audio:it.type==='txt'?ICO.txt:it.type==='image'?ICO.image:ICO.pdf;

    var h='<div class="'+cls+'" data-action="select" data-path="'+attr(it.path)+'" data-course="'+attr(c.id)+'" data-block="'+attr(b.name)+'">';
    h+='<span class="'+iconClass+'">'+icon+'</span>';
    h+='<span class="lesson-main"><span class="lesson-name" title="'+attr(it.title)+'">'+esc(it.title)+'</span>';
    if(pos&&pos.time&&!watched)h+='<span class="lesson-position">'+fmt(pos.time)+' vistos</span>';
    h+='</span>';
    h+='<span class="lesson-check">'+ICO.check+'</span>';
    h+='</div>';
    return h;
  },

  renderStats:function(){
    var el=document.getElementById('statsBar');
    var c=State.currentCourse;
    if(!el||!c)return;

    var done=0;
    c.blocks.forEach(function(b){b.items.forEach(function(it){if(Store.isWatched(it.path))done++;});});
    var total=c.totalItems;
    var pct=total>0?Math.round(done/total*100):0;

    el.innerHTML='<div class="stats-label">Progreso del curso</div>'+
      '<div class="stats-bar-bg"><div class="stats-bar-fill" style="width:'+pct+'%"></div></div>'+
      '<div class="stats-text">'+done+' de '+total+' completadas ('+pct+'%)</div>';
  },

  renderHistory:function(){
    var list=document.getElementById('historyList');
    if(!list)return;
    var items=Store.history(80);
    if(items.length===0){
      list.innerHTML='<div class="history-empty">Todavia no hay historial.</div>';
      return;
    }

    var h='';
    items.forEach(function(p){
      var pct=p.duration?Math.min(100,Math.round(p.time/p.duration*100)):0;
      h+='<button class="history-row" data-action="history-select" data-course="'+attr(p.courseId||'')+'" data-block="'+attr(p.blockName||'')+'" data-path="'+attr(p.path)+'">';
      h+='<span class="history-title">'+esc(p.title||p.path)+'</span>';
      h+='<span class="history-meta">'+esc(p.courseName||'Curso')+' · '+fmt(p.time)+' / '+fmt(p.duration)+'</span>';
      h+='<span class="history-bar"><span style="width:'+pct+'%"></span></span>';
      h+='</button>';
    });
    list.innerHTML=h;
  },

  openHistory:function(){
    this.renderHistory();
    document.getElementById('historyModal').classList.add('visible');
  },
  closeHistory:function(){
    document.getElementById('historyModal').classList.remove('visible');
  },
  toggleSidebar:function(){
    var sidebar=document.getElementById('sidebar');
    var overlay=document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('mobile-open');
    overlay.classList.toggle('visible',sidebar.classList.contains('mobile-open'));
  },
  closeSidebar:function(){
    document.getElementById('sidebar').classList.remove('mobile-open');
    document.getElementById('sidebarOverlay').classList.remove('visible');
  }
};

function lastCourseProgress(course){
  var best=null;
  course.blocks.forEach(function(b){
    b.items.forEach(function(it){
      var p=Store.getPosition(it.path);
      if(p&&(!best||Number(p.updatedAt||0)>Number(best.updatedAt||0)))best=p;
    });
  });
  return best;
}

function playableVideos(course){
  var list=[];
  if(!course)return list;
  course.blocks.forEach(function(block){
    block.items.forEach(function(item){
      if(item.type==='video')list.push({block:block,item:item});
    });
  });
  return list;
}

function nextVideoAfter(course,path){
  var list=playableVideos(course);
  for(var i=0;i<list.length;i++){
    if(list[i].item.path===path)return list[i+1]||null;
  }
  return null;
}

/* ========== MEDIA PLAYER ========== */
var Player={
  mediaEl:null,
  tsPlayer:null,
  type:null,
  lastProgressSave:0,
  controlsTimer:null,
  resumeTarget:null,
  nextTimer:null,
  nextCountdown:0,
  pendingNext:null,

  open:function(item){
    var videoEl=document.getElementById('videoEl');
    var audioEl=document.getElementById('audioEl');
    var audioDisp=document.getElementById('audioDisplay');
    var playerArea=document.getElementById('playerArea');
    var emptyState=document.getElementById('emptyState');
    var controlsBar=document.getElementById('controlsBar');
    var infoBar=document.getElementById('infoBar');
    var attArea=document.getElementById('attachmentsArea');
    var attList=document.getElementById('attachmentsList');

    this.cancelNextCountdown();
    this.destroyTransportPlayer();
    emptyState.style.display='none';
    playerArea.style.display='flex';
    videoEl.style.display='none';
    audioEl.style.display='none';
    audioDisp.style.display='none';
    videoEl.pause();audioEl.pause();
    videoEl.removeAttribute('src');audioEl.removeAttribute('src');
    videoEl.load();audioEl.load();
    // Hide inline viewer
    var staticViewer=document.getElementById('staticViewer');
    if(staticViewer)staticViewer.style.display='none';

    var url=mediaUrl(item.path);
    this.type=item.type;
    this.resumeTarget=Store.getPosition(item.path);
    this.lastProgressSave=0;

    if(item.type==='video'){
      videoEl.style.display='block';
      videoEl.controls=false;
      videoEl.preload='metadata';
      this.mediaEl=videoEl;
      if(isTransportStream(item.name)){
        this.setupTransportStream(videoEl,url,item);
      }else{
        videoEl.src=url;
      }
      controlsBar.classList.add('visible');
      infoBar.classList.add('visible');
    }else if(item.type==='audio'){
      audioDisp.style.display='flex';
      audioEl.preload='metadata';
      audioEl.src=url;
      document.getElementById('audioTitle').textContent=item.title;
      this.mediaEl=audioEl;
      controlsBar.classList.add('visible');
      infoBar.classList.add('visible');
    }else if(item.type==='pdf'||item.type==='txt'||item.type==='image'){
      playerArea.style.display='none';
      controlsBar.classList.remove('visible');
      infoBar.classList.add('visible');
      this.mediaEl=null;
      // Show inline viewer
      if(staticViewer){
        staticViewer.style.display='block';
        var vContent=staticViewer.querySelector('.viewer-content');
        if(vContent){
          if(item.type==='pdf'){
            vContent.innerHTML='<iframe src="'+url+'" title="'+attr(item.title)+'"></iframe>';
          }else if(item.type==='image'){
            vContent.innerHTML='<img src="'+url+'" alt="'+attr(item.title)+'" style="max-width:100%;max-height:70vh;display:block;margin:auto;border-radius:8px;">';
          }else if(item.type==='txt'){
            vContent.innerHTML='<div class="txt-loading">Cargando...</div>';
            fetch(url).then(function(r){return r.text();}).then(function(text){
              vContent.innerHTML='<pre class="txt-viewer">'+esc(text)+'</pre>';
            }).catch(function(){vContent.innerHTML='<p style="color:var(--red);padding:20px">No se pudo cargar el archivo.</p>';});
          }
        }
        // Download button inside viewer
        var dlBtn=staticViewer.querySelector('.viewer-download');
        if(dlBtn){dlBtn.href=url;dlBtn.download=item.name;}
      }
    }

    document.getElementById('infoTitle').textContent=item.title;
    document.getElementById('infoSubtitle').textContent=State.currentBlock?State.currentBlock.name:'';
    this.updateMarkBtn(item.path);

    if(this.mediaEl){
      this.playMedia();
    }

    if(item.attachments&&item.attachments.length>0){
      attArea.style.display='block';
      var ah='';
      item.attachments.forEach(function(att){
        var attUrl=mediaUrl(att.path);
        var attIco=att.type==='txt'?ICO.txt:att.type==='image'?ICO.image:ICO.pdf;
        ah+='<div class="attachment-card" data-action="open-attachment" data-path="'+attr(att.path)+'" data-type="'+attr(att.type)+'" data-name="'+attr(att.name)+'" style="cursor:pointer">';
        ah+='<div class="attachment-icon">'+attIco+'</div>';
        ah+='<div class="attachment-info">';
        ah+='<div class="attachment-name" title="'+attr(att.name)+'">'+esc(att.name)+'</div>';
        ah+='<div class="attachment-size">'+formatBytes(att.size)+'</div>';
        ah+='</div>';
        ah+='<a href="'+attUrl+'" download="'+attr(att.name)+'" class="attachment-action" title="Descargar" onclick="event.stopPropagation()">'+ICO.download+'</a>';
        ah+='</div>';
      });
      attList.innerHTML=ah;
    }else{
      attArea.style.display='none';
    }
  },

  destroyTransportPlayer:function(){
    if(!this.tsPlayer)return;
    try{this.tsPlayer.pause();}catch(e){}
    try{this.tsPlayer.unload();}catch(e){}
    try{this.tsPlayer.detachMediaElement();}catch(e){}
    try{this.tsPlayer.destroy();}catch(e){}
    this.tsPlayer=null;
  },
  setupTransportStream:function(videoEl,url,item){
    if(window.mpegts&&window.mpegts.isSupported()){
      var sourceUrl=new URL(url,window.location.href).href;
      var self=this;
      this.tsPlayer=window.mpegts.createPlayer({
        type:'mpegts',
        isLive:false,
        url:sourceUrl,
        filesize:item.size||undefined
      },{
        enableWorker:false,
        lazyLoad:true,
        seekType:'range'
      });
      if(window.mpegts.Events&&window.mpegts.Events.ERROR){
        this.tsPlayer.on(window.mpegts.Events.ERROR,function(type,detail,info){
          console.warn('No se pudo reproducir MPEG-TS',type,detail,info);
          self.showTransportError();
        });
      }
      this.tsPlayer.attachMediaElement(videoEl);
      this.tsPlayer.load();
      return;
    }
    videoEl.src=url;
    var sub=document.getElementById('infoSubtitle');
    if(sub)sub.textContent='Este navegador no tiene soporte MPEG-TS. Prueba en Chrome/Edge con conexion a internet o convierte este video a MP4.';
  },
  showTransportError:function(){
    var sub=document.getElementById('infoSubtitle');
    if(sub)sub.textContent='No se pudo cargar este .ts. Recarga la pagina; si sigue igual, el navegador no soporta este stream.';
  },
  playMedia:function(){
    if(!this.mediaEl)return Promise.resolve();
    if(this.tsPlayer&&this.mediaEl.paused&&this.tsPlayer.play){
      return this.tsPlayer.play().catch(function(){});
    }
    return this.mediaEl.play().catch(function(){});
  },
  pause:function(){
    if(this.tsPlayer&&this.tsPlayer.pause)this.tsPlayer.pause();
    else if(this.mediaEl)this.mediaEl.pause();
  },
  togglePlay:function(){
    if(!this.mediaEl)return;
    if(this.mediaEl.paused)this.playMedia();
    else this.pause();
  },
  seekTo:function(time){
    if(this.mediaEl&&!isNaN(this.mediaEl.duration)){
      this.mediaEl.currentTime=Math.max(0,Math.min(time,this.mediaEl.duration));
      this.saveProgress(true);
    }
  },
  seekRelative:function(delta){if(this.mediaEl)this.seekTo(this.mediaEl.currentTime+delta);},
  setVolume:function(v){
    if(!this.mediaEl)return;
    this.mediaEl.volume=Math.max(0,Math.min(1,v));
    this.mediaEl.muted=false;
    this.updateVolumeIcon();
  },
  toggleMute:function(){
    if(this.mediaEl){
      this.mediaEl.muted=!this.mediaEl.muted;
      this.updateVolumeIcon();
    }
  },
  cycleSpeed:function(dir){
    if(!this.mediaEl)return;
    var speeds=[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
    var current=this.mediaEl.playbackRate||1;
    var idx=speeds.indexOf(current);
    if(idx===-1) idx=speeds.indexOf(1);
    var nextIdx=idx+(dir||1);
    if(nextIdx>=speeds.length) nextIdx=0;
    if(nextIdx<0) nextIdx=speeds.length-1;
    var next=speeds[nextIdx];
    this.mediaEl.playbackRate=next;
    if(this.tsPlayer)this.tsPlayer.playbackRate=next;
    document.getElementById('speedBtn').textContent=next+'x';
    this.showControls();
  },
  updateVolumeIcon:function(){
    var muted=this.mediaEl&&(this.mediaEl.muted||this.mediaEl.volume===0);
    document.getElementById('iconVolume').style.display=muted?'none':'block';
    document.getElementById('iconMuted').style.display=muted?'block':'none';
  },
  fullscreen:function(){
    var target=document.getElementById('mainContent');
    if(document.fullscreenElement){
      document.exitFullscreen();
    }else if(target.requestFullscreen){
      target.requestFullscreen().then(function(){Player.showControls();}).catch(function(){});
    }
  },
  isFullscreen:function(){
    return !!document.fullscreenElement;
  },
  showControls:function(){
    var main=document.getElementById('mainContent');
    main.classList.add('controls-showing');
    clearTimeout(this.controlsTimer);
    var self=this;
    this.controlsTimer=setTimeout(function(){
      if(self.isFullscreen()&&self.mediaEl&&!self.mediaEl.paused){
        main.classList.remove('controls-showing');
      }
    },3200);
  },
  onFullscreenChange:function(){
    var main=document.getElementById('mainContent');
    if(this.isFullscreen()){
      main.classList.add('fullscreen-mode','controls-showing');
      this.showControls();
    }else{
      main.classList.remove('fullscreen-mode','controls-showing');
      clearTimeout(this.controlsTimer);
    }
  },
  onLoadedMetadata:function(){
    if(!this.mediaEl)return;
    var pos=this.resumeTarget;
    if(pos&&pos.time>3&&this.mediaEl.duration&&this.mediaEl.duration-pos.time>8){
      try{this.mediaEl.currentTime=pos.time;}catch(e){}
    }
    this.updateUI();
  },
  saveProgress:function(force){
    if(!this.mediaEl||!State.currentItem)return;
    var now=Date.now();
    if(!force&&now-this.lastProgressSave<5000)return;
    this.lastProgressSave=now;
    Store.setPosition(State.currentItem,this.mediaEl.currentTime||0,this.mediaEl.duration||0);
  },
  startNextCountdown:function(){
    this.cancelNextCountdown();
    if(!State.currentCourse||!State.currentItem||State.currentItem.type!=='video')return;

    var next=nextVideoAfter(State.currentCourse,State.currentItem.path);
    if(!next)return;

    var overlay=document.getElementById('nextOverlay');
    var countEl=document.getElementById('nextCount');
    var titleEl=document.getElementById('nextTitle');
    this.pendingNext=next;
    this.nextCountdown=3;
    countEl.textContent=this.nextCountdown;
    titleEl.textContent=next.item.title;
    overlay.style.display='flex';
    this.showControls();

    var self=this;
    this.nextTimer=setInterval(function(){
      self.nextCountdown-=1;
      countEl.textContent=self.nextCountdown;
      if(self.nextCountdown<=0){
        var target=self.pendingNext;
        self.cancelNextCountdown();
        if(target)selectItem(State.currentCourse.id,target.block.name,target.item.path);
      }
    },1000);
  },
  cancelNextCountdown:function(){
    clearInterval(this.nextTimer);
    this.nextTimer=null;
    this.pendingNext=null;
    this.nextCountdown=0;
    var overlay=document.getElementById('nextOverlay');
    if(overlay)overlay.style.display='none';
  },
  updateUI:function(){
    if(!this.mediaEl)return;
    var cur=this.mediaEl.currentTime||0, dur=this.mediaEl.duration||0;
    var pct=dur>0?(cur/dur*100):0;
    document.getElementById('timeCurrent').textContent=fmt(cur);
    document.getElementById('timeDuration').textContent=fmt(dur);
    document.getElementById('seekProgress').style.width=pct+'%';
    document.getElementById('seekThumb').style.left=pct+'%';

    var playing=!this.mediaEl.paused;
    document.getElementById('iconPlay').style.display=playing?'none':'block';
    document.getElementById('iconPause').style.display=playing?'block':'none';

    if(this.type==='audio'){
      var art=document.getElementById('audioArt');
      if(playing)art.classList.add('playing');else art.classList.remove('playing');
    }

    if(this.mediaEl.buffered&&this.mediaEl.buffered.length>0){
      var buffEnd=this.mediaEl.buffered.end(this.mediaEl.buffered.length-1);
      document.getElementById('seekBuffered').style.width=(dur>0?(buffEnd/dur*100):0)+'%';
    }
  },
  updateMarkBtn:function(path){
    var btn=document.getElementById('markBtn'), label=document.getElementById('markLabel');
    if(Store.isWatched(path)){
      btn.classList.add('done');
      label.textContent='Completado';
    }else{
      btn.classList.remove('done');
      label.textContent='Marcar completado';
    }
  }
};

/* ========== EVENTS & INIT ========== */
function initSeek(){
  var container=document.getElementById('seekContainer'), track=document.getElementById('seekTrack'), tooltip=document.getElementById('seekTooltip'), dragging=false;
  function clientX(e){
    return e.touches&&e.touches.length?e.touches[0].clientX:e.clientX;
  }
  function getTime(e){
    var rect=track.getBoundingClientRect(), pct=Math.max(0,Math.min(1,(clientX(e)-rect.left)/rect.width)), dur=Player.mediaEl?Player.mediaEl.duration||0:0;
    return{pct:pct,time:pct*dur};
  }
  function begin(e){
    if(!Player.mediaEl)return;
    dragging=true;
    Player.showControls();
    Player.seekTo(getTime(e).time);
  }
  function move(e){
    if(!Player.mediaEl)return;
    var info=getTime(e);
    tooltip.textContent=fmt(info.time);
    tooltip.style.left=(info.pct*100)+'%';
    if(dragging){
      e.preventDefault();
      Player.seekTo(info.time);
    }
  }
  function end(){dragging=false;}
  container.addEventListener('mousedown',begin);
  container.addEventListener('touchstart',begin,{passive:true});
  document.addEventListener('mousemove',move);
  document.addEventListener('touchmove',move,{passive:false});
  document.addEventListener('mouseup',end);
  document.addEventListener('touchend',end);
}

function applyTheme(theme){
  document.documentElement.setAttribute('data-theme',theme);
  Store.setTheme(theme);
  document.getElementById('themeIconMoon').style.display=theme==='dark'?'block':'none';
  document.getElementById('themeIconSun').style.display=theme==='dark'?'none':'block';
}

function selectItem(courseId,blockName,path){
  var course=State.courses.find(function(c){return c.id===courseId;});
  if(!course)return;
  var block=course.blocks.find(function(b){return b.name===blockName;});
  if(!block)return;
  var item=block.items.find(function(it){return it.path===path;});
  if(!item)return;

  State.currentItem=item;
  State.currentCourse=course;
  State.currentBlock=block;
  State.blockExpanded[courseId+'/'+blockName]=true;
  Store.setCurrent({courseId:courseId,blockName:blockName,path:path});

  if(State.viewMode!=='player')UI.switchView('player');
  else UI.renderSidebar();
  UI.closeSidebar();
  Player.open(item);
}

function openCourse(id){
  State.currentCourse=State.courses.find(function(c){return c.id===id;});
  if(State.currentCourse){
    State.currentItem=null;
    State.currentBlock=null;
    document.getElementById('playerArea').style.display='none';
    document.getElementById('controlsBar').classList.remove('visible');
    document.getElementById('infoBar').classList.remove('visible');
    document.getElementById('emptyState').style.display='flex';
    document.getElementById('attachmentsArea').style.display='none';
    UI.switchView('player');
  }
}

function initEvents(){
  document.body.addEventListener('click',function(e){
    var target=e.target.closest('[data-action]');
    if(!target)return;
    var action=target.dataset.action;

    if(action==='open-course'){
      openCourse(target.dataset.id);
    }else if(action==='toggle-block'){
      var key=target.dataset.key;
      var children=target.nextElementSibling;
      State.blockExpanded[key]=!target.classList.contains('open');
      if(children)children.classList.toggle('open',State.blockExpanded[key]);
      target.classList.toggle('open',State.blockExpanded[key]);
    }else if(action==='select'){
      selectItem(target.dataset.course,target.dataset.block,target.dataset.path);
    }else if(action==='history-select'){
      UI.closeHistory();
      selectItem(target.dataset.course,target.dataset.block,target.dataset.path);
    }else if(action==='close-history'){
      UI.closeHistory();
    }else if(action==='open-attachment'){
      var aPath=target.dataset.path, aType=target.dataset.type, aName=target.dataset.name;
      var aUrl=mediaUrl(aPath);
      var sv=document.getElementById('staticViewer');
      if(sv){
        sv.style.display='block';
        var vc=sv.querySelector('.viewer-content');
        if(vc){
          if(aType==='pdf')vc.innerHTML='<iframe src="'+aUrl+'" title="'+esc(aName)+'"></iframe>';
          else if(aType==='image')vc.innerHTML='<img src="'+aUrl+'" alt="'+esc(aName)+'" style="max-width:100%;max-height:70vh;display:block;margin:auto;border-radius:8px;">';
          else if(aType==='txt'){
            vc.innerHTML='<div class="txt-loading">Cargando...</div>';
            fetch(aUrl).then(function(r){return r.text();}).then(function(t){vc.innerHTML='<pre class="txt-viewer">'+esc(t)+'</pre>';});
          }
        }
        var db=sv.querySelector('.viewer-download');
        if(db){db.href=aUrl;db.download=aName;}
      }
    }
  });

  document.getElementById('backBtn').addEventListener('click',function(){UI.switchView('home');});
  document.getElementById('mobileMenuBtn').addEventListener('click',function(){UI.toggleSidebar();});
  document.getElementById('sidebarOverlay').addEventListener('click',function(){UI.closeSidebar();});
  document.getElementById('themeToggle').addEventListener('click',function(){applyTheme(Store.getTheme()==='dark'?'light':'dark');});
  document.getElementById('historyBtn').addEventListener('click',function(){UI.openHistory();});
  document.getElementById('resetBtn').addEventListener('click',function(){
    if(confirm('Reiniciar progreso e historial?')){
      Store.clear();
      if(State.viewMode==='home')UI.renderHome();else UI.renderSidebar();
      UI.renderHistory();
    }
  });

  document.getElementById('playBtn').addEventListener('click',function(){Player.togglePlay();Player.showControls();});
  document.getElementById('prevBtn').addEventListener('click',function(){Player.seekRelative(-10);Player.showControls();});
  document.getElementById('nextBtn').addEventListener('click',function(){Player.seekRelative(10);Player.showControls();});
  document.getElementById('muteBtn').addEventListener('click',function(){Player.toggleMute();Player.showControls();});
  document.getElementById('speedBtn').addEventListener('click',function(){Player.cycleSpeed(1);});
  document.getElementById('fullscreenBtn').addEventListener('click',function(){Player.fullscreen();});
  document.getElementById('volumeSlider').addEventListener('input',function(){Player.setVolume(parseFloat(this.value));Player.showControls();});
  document.getElementById('nextCancel').addEventListener('click',function(){Player.cancelNextCountdown();});

  document.getElementById('markBtn').addEventListener('click',function(){
    if(!State.currentItem)return;
    Store.toggleWatched(State.currentItem.path);
    Player.updateMarkBtn(State.currentItem.path);
    if(State.viewMode==='player')UI.renderSidebar();
    UI.renderHome();
  });

  var videoEl=document.getElementById('videoEl'), audioEl=document.getElementById('audioEl'), playerArea=document.getElementById('playerArea');
  videoEl.addEventListener('click',function(){
    if(Player.isFullscreen()){
      Player.showControls();
      return;
    }
    Player.togglePlay();
  });
  playerArea.addEventListener('pointerdown',function(){
    if(Player.isFullscreen())Player.showControls();
  });

  [videoEl,audioEl].forEach(function(el){
    el.addEventListener('timeupdate',function(){Player.updateUI();Player.saveProgress(false);});
    el.addEventListener('play',function(){Player.updateUI();Player.showControls();});
    el.addEventListener('pause',function(){Player.updateUI();Player.saveProgress(true);Player.showControls();});
    el.addEventListener('loadedmetadata',function(){Player.onLoadedMetadata();});
    el.addEventListener('ended',function(){
      Player.saveProgress(true);
      if(State.currentItem&&!Store.isWatched(State.currentItem.path)){
        Store.setWatched(State.currentItem.path,true);
        Player.updateMarkBtn(State.currentItem.path);
        if(State.viewMode==='player')UI.renderSidebar();
        UI.renderHome();
      }
      Player.startNextCountdown();
    });
  });

  document.addEventListener('fullscreenchange',function(){Player.onFullscreenChange();});
  document.addEventListener('visibilitychange',function(){
    if(document.hidden){
      Player.saveProgress(true);
      Store.flushSave();
    }
  });
  window.addEventListener('beforeunload',function(){
    Player.saveProgress(true);
    Store.flushSave();
  });

  document.addEventListener('keydown',function(e){
    if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT')return;
    switch(e.code){
      case'Space':e.preventDefault();Player.togglePlay();break;
      case'ArrowLeft':e.preventDefault();if(e.shiftKey)Player.cycleSpeed(-1);else Player.seekRelative(-10);break;
      case'ArrowRight':e.preventDefault();if(e.shiftKey)Player.cycleSpeed(1);else Player.seekRelative(10);break;
      case'KeyF':Player.fullscreen();break;
      case'KeyM':Player.toggleMute();break;
      case'Escape':UI.closeHistory();break;
    }
  });

  initSeek();
}

function init(){
  initEvents();
  Store.load().then(function(){
    applyTheme(Store.getTheme());
    return API.fetchTree();
  }).then(function(tree){
    State.courses=parseTree(tree);
    UI.switchView('home');
    UI.renderHistory();

    var cur=Store.getCurrent();
    if(cur&&cur.path){
      selectItem(cur.courseId,cur.blockName,cur.path);
    }
  }).catch(function(err){
    console.error('Error loading:',err);
    document.getElementById('courseGrid').innerHTML='<div class="empty-inline error">Error al cargar cursos.</div>';
  });
}

document.addEventListener('DOMContentLoaded',init);
})();
