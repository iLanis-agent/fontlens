/* FontLens engine - TTF/OTF sfnt inspector.
   Offset table + directory with per-table checksum verification, head
   (unitsPerEm, bbox, checkSumAdjustment verify), maxp numGlyphs, name table
   (UTF-16BE Windows + Mac Roman), OS/2 weight/width/embedding, post
   italic/fixed-pitch, cmap format 4/12 coverage. No deps.
   Browser global FontLens, or module.exports in node. */
(function(root){
'use strict';
function hex(n,w){var s=n.toString(16);while(s.length<w)s='0'+s;return s;}
function parse(bytes){
  var out={errors:[],warnings:[],tables:[]};
  out.size=bytes.length;
  if(bytes.length<12){out.errors.push('file too short for an sfnt header');return out;}
  var b=bytes;
  function u16(o){return (b[o]<<8)|b[o+1];}
  function s16(o){var v=u16(o);return v>0x7FFF?v-0x10000:v;}
  function u32(o){return ((b[o]<<24)|(b[o+1]<<16)|(b[o+2]<<8)|b[o+3])>>>0;}
  var scaler=[b[0],b[1],b[2],b[3]];
  out.scaler_hex=hex(b[0],2)+hex(b[1],2)+hex(b[2],2)+hex(b[3],2);
  if(out.scaler_hex==='74746366'){out.errors.push('TrueType collection (.ttc) not supported - extract one font first');return out;}
  if(out.scaler_hex!=='00010000'&&out.scaler_hex!=='4f54544f'&&out.scaler_hex!=='74727565'){
    out.errors.push('unknown scaler type 0x'+out.scaler_hex+' (not a TTF/OTF)');return out;
  }
  var numTables=u16(4);
  out.num_tables=numTables;
  if(numTables>200){out.errors.push('implausible table count '+numTables);return out;}
  var i,e,tag,cks,off,ln;
  var byTag={};
  function sum32(start,len){
    var s=0,end=start+len;
    for(var p=start;p<end;p+=4){
      var w=((b[p]||0)<<24)|((b[p+1]||0)<<16)|((b[p+2]||0)<<8)|(b[p+3]||0);
      s=(s+w)>>>0;
    }
    return s;
  }
  var truncated=false;
  for(i=0;i<numTables;i++){
    e=12+i*16;
    if(e+16>bytes.length){truncated=true;break;}
    tag=String.fromCharCode(b[e],b[e+1],b[e+2],b[e+3]);
    cks=u32(e+4);off=u32(e+8);ln=u32(e+12);
    var t={tag:tag,checksum_recorded:cks,offset:off,length:ln};
    if(off+ln<=bytes.length){
      t.checksum_computed=sum32(off,ln);
      t.checksum_ok=t.checksum_computed===cks;
    } else {t.truncated=true;truncated=true;}
    out.tables.push(t);
    byTag[tag]=t;
  }
  if(truncated)out.warnings.push('file appears truncated (table data beyond end of file)');
  /* head */
  var head=byTag['head'];
  if(head&&!head.truncated&&head.length>=54){
    var ho=head.offset;
    out.units_per_em=u16(ho+18);
    out.bbox=[s16(ho+36),s16(ho+38),s16(ho+40),s16(ho+42)];
    out.loc_format=s16(ho+50);
    out.adjustment_val=u32(ho+8);
    /* verify: whole-file sum with adjustment field zeroed, plus val, == 0xB1B0AFBA */
    var saved=[b[ho+8],b[ho+9],b[ho+10],b[ho+11]];
    b[ho+8]=b[ho+9]=b[ho+10]=b[ho+11]=0;
    var total=sum32(0,bytes.length);
    b[ho+8]=saved[0];b[ho+9]=saved[1];b[ho+10]=saved[2];b[ho+11]=saved[3];
    out.adjustment_ok=((total+out.adjustment_val)>>>0)===0xB1B0AFBA;
    out.magic_ok=u32(ho+12)===0x5F0F3CF5;
  }
  /* maxp */
  var maxp=byTag['maxp'];
  if(maxp&&!maxp.truncated&&maxp.length>=6)out.num_glyphs=u16(maxp.offset+4);
  /* OS/2 */
  var os2=byTag['OS/2'];
  if(os2&&!os2.truncated&&os2.length>=10){
    out.weight_class=u16(os2.offset+4);
    out.width_class=u16(os2.offset+6);
    out.fs_type=u16(os2.offset+8);
  }
  /* post */
  var post=byTag['post'];
  if(post&&!post.truncated&&post.length>=16){
    var po=post.offset;
    var ia=u32(po+4);
    out.italic_angle=(ia>0x7FFFFFFF?ia-0x100000000:ia)/65536;
    out.italic_angle=Math.round(out.italic_angle*10000)/10000;
    out.underline_position=s16(po+8);
    out.fixed_pitch=u32(po+12)!==0;
  }
  /* name */
  var name=byTag['name'];
  if(name&&!name.truncated&&name.length>=6){
    var no=name.offset,count=u16(no+2),strOff=no+u16(no+4);
    var recs=[];
    for(i=0;i<count;i++){
      e=no+6+i*12;
      if(e+12>bytes.length)break;
      recs.push({platform:u16(e),encoding:u16(e+2),lang:u16(e+4),id:u16(e+6),len:u16(e+8),off:u16(e+10)});
    }
    function decode(r){
      var s='',p=strOff+r.off,j;
      if(r.platform===0||r.platform===3){
        for(j=0;j+1<r.len;j+=2)s+=String.fromCharCode((b[p+j]<<8)|b[p+j+1]);
      } else {
        for(j=0;j<r.len;j++)s+=String.fromCharCode(b[p+j]);
      }
      return s;
    }
    function pref(id){
      var r=null,j;
      for(j=0;j<recs.length;j++)if(recs[j].id===id&&recs[j].platform===3&&recs[j].encoding===1&&recs[j].lang===0x409){r=recs[j];break;}
      if(!r)for(j=0;j<recs.length;j++)if(recs[j].id===id&&recs[j].platform===1&&recs[j].encoding===0&&recs[j].lang===0){r=recs[j];break;}
      if(!r)for(j=0;j<recs.length;j++)if(recs[j].id===id&&recs[j].platform===3){r=recs[j];break;}
      if(!r)for(j=0;j<recs.length;j++)if(recs[j].id===id){r=recs[j];break;}
      return r?decode(r):null;
    }
    var ids={1:'family',2:'subfamily',3:'unique',4:'full',5:'version_str',6:'postscript',16:'pref_family',17:'pref_subfamily'};
    out.names={};
    for(var id in ids){var v=pref(parseInt(id,10));if(v)out.names[ids[id]]=v;}
  }
  /* cmap: choose best subtable (format 12 unicode, then format 4 (3,1)/platform 0, then any 4, then 0) */
  var cmap=byTag['cmap'];
  if(cmap&&!cmap.truncated&&cmap.length>=4){
    var co=cmap.offset,nSub=u16(co+2),subs=[];
    for(i=0;i<nSub;i++){
      e=co+4+i*8;
      if(e+8>bytes.length)break;
      var so=co+u32(e+4);
      if(so+2>bytes.length)continue;
      subs.push({platform:u16(e),encoding:u16(e+2),off:so,format:u16(so)});
    }
    var best=null;
    function pick(pred){for(var j=0;j<subs.length;j++)if(pred(subs[j]))return subs[j];return null;}
    best=pick(function(s){return s.format===12&&(s.platform===3&&s.encoding===10||s.platform===0);})
        ||pick(function(s){return s.format===4&&(s.platform===3&&s.encoding===1||s.platform===0);})
        ||pick(function(s){return s.format===4;})
        ||pick(function(s){return s.format===12;})
        ||pick(function(s){return s.format===0;});
    if(best){
      out.cmap_platform=best.platform;out.cmap_encoding=best.encoding;out.cmap_format=best.format;
      var cps=0,minCp=-1,maxCp=-1,ranges=[];
      if(best.format===4){
        var segCount=u16(best.off+6)/2;
        var endBase=best.off+14;
        var startBase=endBase+segCount*2+2;
        var deltaBase=startBase+segCount*2;
        var roBase=deltaBase+segCount*2;
        var segRanges=[];
        for(i=0;i<segCount;i++){
          var end=u16(endBase+i*2),start=u16(startBase+i*2);
          if(start===0xFFFF&&end===0xFFFF)continue;
          if(end<start)continue;
          segRanges.push([start,end]);
          var delta=s16(deltaBase+i*2),ro=u16(roBase+i*2);
          for(var c=start;c<=end;c++){
            var gid;
            if(ro===0){gid=(c+delta)&0xFFFF;}
            else{
              var ga=roBase+i*2+ro+(c-start)*2;
              if(ga+2>bytes.length){gid=0;}
              else{var g=u16(ga);gid=g===0?0:(g+delta)&0xFFFF;}
            }
            if(gid!==0){
              cps++;
              if(minCp<0||c<minCp)minCp=c;
              if(maxCp<0||c>maxCp)maxCp=c;
            }
          }
        }
        ranges=segRanges;
      } else if(best.format===12){
        var nGroups=u32(best.off+12);
        for(i=0;i<nGroups;i++){
          var g=best.off+16+i*12;
          if(g+12>bytes.length)break;
          var st=u32(g),en=u32(g+4);
          cps+=en-st+1;
          if(minCp<0||st<minCp)minCp=st;
          if(maxCp<0||en>maxCp)maxCp=en;
          if(ranges.length<20)ranges.push([st,en]);
        }
      } else if(best.format===0){
        for(i=0;i<256;i++)if(b[best.off+6+i]!==0){cps++;if(minCp<0)minCp=i;maxCp=i;}
      }
      out.cmap_count=cps;
      if(minCp>=0){out.cmap_min=minCp;out.cmap_max=maxCp;out.cmap_ranges=ranges.slice(0,20);}
    }
  }
  return out;
}
var api={parse:parse};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.FontLens=api;
})(typeof self!=='undefined'?self:this);
