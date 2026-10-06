/* FontLens tests: shared engine over the corpus vs tests/expected.json
   (oracle.py: real fontTools + independent python checksum math). */
'use strict';
const fs=require('fs'),path=require('path');
const engine=require(path.join(__dirname,'..','engine.js'));
function load(p){
  if(fs.existsSync(p))return new Uint8Array(fs.readFileSync(p));
  const b=p+'.b64';
  if(fs.existsSync(b))return new Uint8Array(Buffer.from(fs.readFileSync(b,'utf8').trim(),'base64'));
  throw new Error('missing corpus '+p);
}
const items=JSON.parse(fs.readFileSync(path.join(__dirname,'expected.json'),'utf8')).items;
let fail=0,pass=0;
function eq(a,b,label){
  if(JSON.stringify(a)===JSON.stringify(b)){pass++;return;}
  fail++;console.log('FAIL '+label+': got '+JSON.stringify(a)+' want '+JSON.stringify(b));
}
for(const item of items){
  const bytes=load(path.join(__dirname,'corpus',item.file));
  const r=engine.parse(bytes);
  const T=item.file+' ';
  eq(r.size,item.size,T+'size');
  if(item.expect_warning){
    if(r.warnings.some(w=>w.indexOf(item.expect_warning)>=0)){pass++;}
    else {fail++;console.log('FAIL '+T+'missing warning '+item.expect_warning+' (got '+JSON.stringify(r.warnings)+')');}
    continue;
  }
  eq(r.errors.length,0,T+'errors '+JSON.stringify(r.errors));
  eq(r.scaler_hex,item.scaler_hex,T+'scaler');
  eq(r.num_tables,item.num_tables,T+'num_tables');
  eq(r.tables.map(t=>t.tag).sort(),item.tables,T+'table tags');
  eq(r.num_glyphs,item.num_glyphs,T+'num_glyphs');
  eq(r.units_per_em,item.units_per_em,T+'units_per_em');
  eq(r.bbox,item.bbox,T+'bbox');
  eq(r.loc_format,item.loc_format,T+'loc_format');
  eq(r.weight_class,item.weight_class,T+'weight_class');
  eq(r.width_class,item.width_class,T+'width_class');
  eq(r.fs_type,item.fs_type,T+'fs_type');
  eq(r.italic_angle,item.italic_angle,T+'italic_angle');
  eq(r.fixed_pitch,item.fixed_pitch,T+'fixed_pitch');
  eq(r.underline_position,item.underline_position,T+'underline_position');
  for(const k of ['family','subfamily','unique','full','version_str','postscript','pref_family','pref_subfamily']){
    if(item[k]!==undefined)eq(r.names[k],item[k],T+'name.'+k);
  }
  eq(r.cmap_count,item.cmap_count,T+'cmap_count');
  eq(r.cmap_min,item.cmap_min,T+'cmap_min');
  eq(r.cmap_max,item.cmap_max,T+'cmap_max');
  /* checksums: engine computed vs oracle recorded+computed, per table */
  for(const t of r.tables){
    const want=item.table_checksums[t.tag];
    if(!want){fail++;console.log('FAIL '+T+'table '+t.tag+' missing from oracle');continue;}
    eq(t.checksum_recorded,want[0],T+t.tag+'.checksum_recorded');
    eq(t.checksum_computed,want[1],T+t.tag+'.checksum_computed');
    eq([t.offset,t.length],item.table_offsets[t.tag],T+t.tag+'.offset_length');
  }
  eq(r.adjustment_ok,item.adjustment_ok,T+'adjustment_ok');
  eq(r.adjustment_val,item.adjustment_val,T+'adjustment_val');
}
console.log(pass+' passed, '+fail+' failed');
process.exit(fail?1:0);
