/* Bellman Track — advisor collaboration prototype.
   Runs only when Supabase is configured. Never sends the legacy state automatically. */
"use strict";

const root=document.getElementById("portal-root");
const mode=document.body.dataset.portalMode;
const config=window.RL_ADVISOR_CONFIG||{};
const stageNames=["Understand core RL","Map the research landscape","Compare & shortlist topics","Validate the survey scope","Search & synthesize evidence","Write the survey","Revise & submit"];
const courseLabels={
  silver:"David Silver — Reinforcement Learning",
  berkeley:"Berkeley CS 285 — Deep RL",
  huggingface:"Hugging Face — Deep RL Course",
  stanford:"Stanford CS 234 — Reinforcement Learning"
};
const courseCounts={silver:10,berkeley:23,huggingface:8,stanford:16};
const allowedDecisions=["approved","denied","changes_requested"];
let client=null,user=null,project=null,allProjects=[],requests=[],notes=[],latest=null,preview=null,notice="",isError=false,loading=false;
const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const short=(v,n)=>String(v??"").trim().slice(0,n);
const dateStr=s=>{if(!s)return "—";const d=new Date(s);return Number.isNaN(d.getTime())?"—":d.toLocaleString(undefined,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"})};
const safeHref=u=>{try{let x=new URL(u);return ["https:","http:"].includes(x.protocol)?x.href:null}catch{return null}};
const msg=(t,err=false)=>{notice=String(t);isError=err;const el=document.getElementById("portal-notice");if(el){el.textContent=notice;el.hidden=!notice;el.className=err?"portal-message portal-form-error":"portal-message"}};
const setBusy=v=>{loading=v;root.querySelectorAll('button[type="submit"],button[data-action="publish"]').forEach(b=>b.disabled=v)};
const pill=s=>{const x=String(s||"pending");return '<span class="portal-badge '+(allowedDecisions.includes(x)?esc(x):"")+'">'+esc(x.replaceAll("_"," "))+"</span>"};
function busyText(text){root.innerHTML='<div class="portal-message">'+esc(text)+'</div>'}
function pageNotice(){return '<div id="portal-notice" class="'+(isError?'portal-message portal-form-error':'portal-message')+'" '+(!notice?'hidden':'')+'>'+esc(notice)+'</div>'}

function renderSetup(){
 root.innerHTML='<section class="portal-card"><h2>Secure collaboration is not connected yet</h2>'+
 '<p class="portal-muted">The PI request and recommendation screens are in a development branch. They will activate after Supabase Authentication, project membership and database policies are configured and tested.</p>'+
 '<div class="portal-message">No messages have been submitted, and your existing research progress has not been uploaded.</div>'+
 '<p class="portal-muted">Setup details: <a class="portal-link" href="https://github.com/diwash1340E/Research_Dashboard/blob/feature/pi-advisor-dashboard/docs/PI_ADVISOR_DASHBOARD_PLAN.md" target="_blank" rel="noopener">Read the development plan</a></p></section>';
}
function renderLogin(){
 document.getElementById("signout-button").hidden=true;
 root.innerHTML='<div class="portal-grid"><section class="portal-card"><h2>Sign in with your invited email</h2>'+
 '<p class="portal-muted">Only invited researcher and PI accounts can access their assigned projects. Sign in with your password or request a secure email link.</p>'+
 '<form id="login-form"><div class="portal-field"><label for="email">Invited email address</label><input id="email" name="email" type="email" autocomplete="username" required maxlength="254" placeholder="Your invited email"></div>'+
 '<div class="portal-field"><label for="password">Password (for password sign-in)</label><input id="password" name="password" type="password" autocomplete="current-password" placeholder="Your account password"></div>'+
 '<div class="portal-action-row"><button class="portal-button portal-button-primary" type="submit" data-method="password">Sign in with password</button>'+
 '<button class="portal-button" type="submit" data-method="magic-link">Send secure login link</button></div></form>'+pageNotice()+'</section>'+
 '<section class="portal-card"><h2>What stays private?</h2><p class="portal-muted">Your personal journal, private notes, uploaded files, full research backups and raw time logs remain in your browser. Approved progress is shared only when you publish it.</p></section></div>';
}
function renderEmptyAccess(){
 document.getElementById("signout-button").hidden=false;
 root.innerHTML='<section class="portal-card"><h2>No assigned project</h2>'+
 '<p class="portal-muted">This signed-in account is not currently authorized as '+(mode==="advisor"?"an advisor":"a project owner")+' for any project. Ask the administrator to verify invitations and active project membership.</p>'+pageNotice()+'</section>';
}
function renderProjectSelect(){
 if(allProjects.length<=1)return "";
 return '<div class="portal-field"><label for="project-picker">Assigned project</label><select id="project-picker">'+allProjects.map(p=>'<option value="'+esc(p.id)+'" '+(project?.id===p.id?'selected':'')+'>'+esc(p.title)+'</option>').join("")+'</select></div>';
}
function sectionTitle(title,extra=""){return '<div class="portal-heading-row"><h2>'+esc(title)+'</h2>'+extra+'</div>'}
function renderRequestList(advisor){
 if(!requests.length)return '<div class="portal-empty">No requests submitted yet.</div>';
 return '<div class="portal-list">'+requests.map(r=>{
  let body='<div class="portal-item"><div class="portal-meta"><span class="portal-pill">'+esc(r.request_type)+' · '+dateStr(r.created_at)+'</span>'+pill(r.status)+'</div>'+
   '<h3>'+esc(r.title)+'</h3><p>'+esc(r.details)+'</p>';
  if(r.advisor_feedback)body+='<div class="portal-next"><strong>PI decision & suggestion</strong><p>'+esc(r.advisor_feedback)+'</p><span class="portal-pill">'+dateStr(r.decided_at)+'</span></div>';
  if(advisor&&r.status==="pending")body+='<form class="decision-form" data-request-id="'+esc(r.id)+'">'+
   '<div class="portal-field"><label>Decision</label><select name="decision" required><option value="approved">Approve</option><option value="changes_requested">Request changes</option><option value="denied">Deny</option></select></div>'+
   '<div class="portal-field"><label>Explanation / suggested next steps (required)</label><textarea name="feedback" minlength="3" maxlength="4000" required placeholder="Explain your decision and recommend an actionable next step."></textarea></div>'+
   '<div class="portal-action-row"><button class="portal-button portal-button-primary" type="submit">Submit decision</button></div></form>';
  return body+"</div>";
 }).join("")+"</div>";
}
function renderNotes(){
 if(!notes.length)return '<div class="portal-empty">No PI recommendations or notes yet.</div>';
 return '<div class="portal-list">'+notes.map(n=>'<div class="portal-item"><div class="portal-meta"><span class="portal-pill">'+esc(n.category)+' · '+dateStr(n.created_at)+'</span></div><h3>'+esc(n.title)+'</h3><p>'+esc(n.body)+'</p></div>').join("")+'</div>';
}
function renderOwner(){
 document.getElementById("signout-button").hidden=false;
 root.innerHTML=pageNotice()+renderProjectSelect()+
 '<div class="portal-grid"><div class="portal-stack">'+
 '<section class="portal-card">'+sectionTitle("Submit a request",'<span class="portal-badge">PI review</span>')+
 '<p class="portal-muted">Request a paper review, topic approval, milestone sign-off, meeting, or another research decision.</p>'+
 '<form id="request-form"><div class="portal-field"><label>Request category</label><select name="request_type" required>'+
 '<option value="topic">Research topic approval</option><option value="paper">Paper / reading recommendation</option><option value="milestone">Research milestone sign-off</option><option value="meeting">Meeting / discussion</option><option value="other">Other request</option></select></div>'+
 '<div class="portal-field"><label>Title</label><input name="title" required minlength="5" maxlength="180" placeholder="e.g., Review my preliminary RL research directions"></div>'+
 '<div class="portal-field"><label>What would you like your PI to decide?</label><textarea name="details" required minlength="5" maxlength="4000" placeholder="Describe your request, evidence, and what feedback you need."></textarea></div>'+
 '<div class="portal-action-row"><button class="portal-button portal-button-primary" type="submit">Submit to PI</button></div></form></section>'+
 '<section class="portal-card">'+sectionTitle("My approval requests",'<span class="portal-pill">'+requests.length+' total</span>')+renderRequestList(false)+'</section></div>'+
 '<div class="portal-stack"><section class="portal-card">'+sectionTitle("PI notes & recommendations")+renderNotes()+'</section>'+
 '<section class="portal-card">'+sectionTitle("Share research progress")+
 '<p class="portal-muted">Choose exactly what your PI can see. Your private journal, PDF files and detailed notes are never part of this upload.</p>'+
 renderPublishForm()+'</section></div></div>';
}
function renderPublishForm(){
 const saved=latest?.payload?.displayName||"";
 return '<form id="publish-form"><div class="portal-field"><label for="display-name">Display name shown to your PI</label><input id="display-name" name="displayName" maxlength="120" required value="'+esc(saved)+'" placeholder="Your preferred research display name"></div>'+
 '<div class="portal-checks"><label><input type="checkbox" name="share-stage" checked>Research stage and checklist completion</label>'+
 '<label><input type="checkbox" name="share-courses" checked>Course names and lesson progress</label>'+
 '<label><input type="checkbox" name="share-papers" checked>Completed paper titles and source links</label>'+
 '<label><input type="checkbox" name="share-hours">Hours studied in the last 7 days</label>'+
 '<label><input type="checkbox" name="share-next">Current next research action</label></div>'+
 '<div class="portal-action-row"><button type="button" class="portal-button" data-action="preview">Preview shared information</button>'+
 '<button type="submit" class="portal-button portal-button-primary">Publish approved snapshot</button></div>'+
 '<div class="portal-field"><label>Preview (required before publishing)</label><pre id="publish-preview" class="portal-preview">Not previewed yet. Nothing will be shared automatically.</pre></div>'+
 '<p class="portal-muted">Last published: '+(latest?dateStr(latest.created_at):'Never')+'</p>'+
 (latest?'<div class="portal-action-row"><button type="button" class="portal-button" data-action="revoke">Revoke shared progress</button></div>':'')+'</form>';
}
function renderPublished(){
 if(!latest||!latest.payload)return '<div class="portal-empty">Your researcher has not published a progress update yet.</div>';
 const p=latest.payload;
 let out='<div class="portal-pill">Published '+dateStr(latest.created_at)+'</div>';
 out+='<h3 style="margin-top:10px">'+esc(p.displayName||"Researcher")+'</h3><p class="portal-muted">'+esc(p.projectTitle||project.title)+'</p>';
 if(p.stage)out+='<div class="portal-next"><strong>Stage '+esc(p.stage.number)+' — '+esc(p.stage.title)+'</strong><p>'+esc(p.stage.percent)+'% of stage checklist completed</p></div>';
 const metrics=[];
 if(Array.isArray(p.courses))metrics.push(['Course lessons',p.courses.reduce((a,c)=>a+(Number(c.completed)||0),0)]);
 if(Array.isArray(p.papers))metrics.push(['Papers reviewed',p.papers.length]);
 if(p.hoursWeek!==undefined)metrics.push(['Hours / 7 days',Number(p.hoursWeek).toFixed(1)]);
 if(metrics.length)out+='<div class="portal-stats">'+metrics.map(([n,v])=>'<div class="portal-stat"><strong>'+esc(v)+'</strong><span>'+esc(n)+'</span></div>').join("")+'</div>';
 if(Array.isArray(p.courses))out+='<div class="portal-separator"></div><h3>Learning courses</h3><ul class="portal-reading-list">'+p.courses.map(c=>'<li>'+esc(c.name)+': '+esc(c.completed)+' / '+esc(c.total)+' lessons</li>').join("")+'</ul>';
 if(Array.isArray(p.papers))out+='<div class="portal-separator"></div><h3>Completed papers</h3><ul class="portal-reading-list">'+p.papers.map(x=>'<li>'+esc(x.title)+(safeHref(x.url)?' — <a class="portal-link" href="'+esc(safeHref(x.url))+'" target="_blank" rel="noopener noreferrer">Source</a>':'')+'</li>').join("")+'</ul>';
 if(p.nextGoal)out+='<div class="portal-next"><strong>Next research goal</strong><p>'+esc(p.nextGoal)+'</p></div>';
 return out;
}
function renderAdvisor(){
 document.getElementById("signout-button").hidden=false;
 root.innerHTML=pageNotice()+renderProjectSelect()+
 '<div class="portal-grid"><div class="portal-stack">'+
 '<section class="portal-card">'+sectionTitle("Approved research progress")+renderPublished()+'</section>'+
 '<section class="portal-card">'+sectionTitle("Student requests requiring a decision",'<span class="portal-pill">'+requests.filter(r=>r.status==="pending").length+' pending</span>')+
 '<p class="portal-muted">You may approve, deny, or request revisions with a written explanation. You cannot edit the student’s underlying research tracker.</p>'+
 renderRequestList(true)+'</section></div>'+
 '<div class="portal-stack"><section class="portal-card">'+sectionTitle("Add PI note or recommendation")+
 '<form id="note-form"><div class="portal-field"><label>Note category</label><select name="category"><option value="recommendation">Recommendation</option><option value="note">General note</option><option value="reading">Paper to read</option><option value="meeting">Meeting follow-up</option></select></div>'+
 '<div class="portal-field"><label>Title</label><input name="title" minlength="3" maxlength="180" required placeholder="e.g., Compare recent robust RL surveys"></div>'+
 '<div class="portal-field"><label>Recommendation / suggestion</label><textarea name="body" minlength="3" maxlength="4000" required placeholder="Write actionable feedback for your researcher."></textarea></div>'+
 '<div class="portal-action-row"><button class="portal-button portal-button-primary" type="submit">Publish note</button></div></form></section>'+
 '<section class="portal-card">'+sectionTitle("Advisor notes history")+renderNotes()+'</section></div></div>';
}
function getLocalState(){
 let raw;try{raw=JSON.parse(localStorage.getItem("rl_survey_lab_v1")||"null")}catch{throw new Error("Local research progress could not be read. No data was shared.")}
 if(!raw||raw.schema!==1)throw new Error("No compatible Bellman Track progress found in this browser.");
 return raw;
}
function buildAllowlistedSnapshot(form){
 const formData=new FormData(form);
 const state=getLocalState();
 const displayName=short(formData.get("displayName"),120);
 if(!displayName)throw new Error("Enter a display name before publishing.");
 const payload={displayName,projectTitle:short(project.title,200)};
 if(formData.has("share-stage")){
  const number=Math.max(1,Math.min(7,Number(state.currentStage)||1));
  const completed=(state.stageTasks||{})[number]||[];
  const valid=Array.isArray(completed)?new Set(completed.filter(i=>Number.isInteger(i)&&i>=0&&i<4)).size:0;
  payload.stage={number,title:stageNames[number-1],percent:Math.round(100*valid/4)};
 }
 if(formData.has("share-courses")){
  payload.courses=Object.keys(courseLabels).map(k=>({
   name:courseLabels[k],completed:Array.isArray((state.courseProgress||{})[k])?
     Math.min(courseCounts[k],new Set(state.courseProgress[k].filter(i=>Number.isInteger(i)&&i>=0&&i<courseCounts[k])).size):0,
   total:courseCounts[k]
  }));
 }
 if(formData.has("share-papers")){
  payload.papers=(Array.isArray(state.papers)?state.papers:[])
   .filter(x=>x&&["read","included"].includes(x.status)).slice(0,80)
   .map(x=>({title:short(x.title,400),year:Number(x.year)||null,url:safeHref(x.url)||""}));
 }
 if(formData.has("share-hours")){
  const start=Date.now()-7*24*60*60*1000;
  const minutes=(Array.isArray(state.sessions)?state.sessions:[]).reduce((sum,s)=>{
   const t=Date.parse(String(s.date||"")+"T12:00:00");
   return sum+(Number.isFinite(t)&&t>=start&&t<=Date.now()&&Number(s.minutes)>0?Math.min(1440,Number(s.minutes)):0);
  },0);
  payload.hoursWeek=Math.round(minutes/6)/10;
 }
 if(formData.has("share-next"))payload.nextGoal=short(state.nextAction,600);
 return payload;
}
function renderCurrent(){
 if(!project)return renderEmptyAccess();
 if(mode==="advisor")renderAdvisor();else renderOwner();
}
async function fetchAll(){
 if(!client||!user)return renderLogin();
 busyText("Loading your authorized project…");
 const {data:rows,error:pe}=await client.from("projects").select("id,title,owner_user_id,description,created_at").order("created_at",{ascending:true});
 if(pe)throw pe;
 allProjects=(rows||[]).filter(p=>mode==="owner"?p.owner_user_id===user.id:p.owner_user_id!==user.id);
 if(!allProjects.length){project=null;return renderEmptyAccess()}
 project=allProjects.find(p=>p.id===project?.id)||allProjects[0];
 const id=project.id;
 const [q,n,s]=await Promise.all([
  client.from("advisor_requests").select("id,project_id,request_type,title,details,status,advisor_feedback,decided_at,created_at").eq("project_id",id).order("created_at",{ascending:false}).limit(200),
  client.from("advisor_notes").select("id,project_id,category,title,body,created_at").eq("project_id",id).order("created_at",{ascending:false}).limit(100),
  client.from("published_snapshots").select("id,project_id,payload,created_at").eq("project_id",id).order("created_at",{ascending:false}).limit(1)
 ]);
 for(const t of [q,n,s])if(t.error)throw t.error;
 requests=q.data||[];notes=n.data||[];latest=s.data?.[0]||null;preview=null;
 renderCurrent();
}
async function initialize(){
 const {data,error}=await client.auth.getUser();
 if(error&&error.name!=="AuthSessionMissingError"){msg(error.message,true)}
 user=data?.user||null;
 if(!user){renderLogin();return}
 document.getElementById("signout-button").hidden=false;
 await fetchAll();
}
async function signIn(email){
 const redirect=window.location.origin+window.location.pathname;
 const {error}=await client.auth.signInWithOtp({email,options:{emailRedirectTo:redirect,shouldCreateUser:false}});
 if(error)throw error;
 msg("If this address belongs to an invited account, check your email for a secure sign-in link.");
}
async function signInWithPassword(email,password){
 if(!password)throw new Error("Enter your account password, or choose Send secure login link.");
 const {error}=await client.auth.signInWithPassword({email,password});
 if(error)throw error;
 msg("Signed in. Loading your authorized project…");
}
async function insertRequest(form){
 const fields=new FormData(form);
 const data={project_id:project.id,submitted_by:user.id,request_type:String(fields.get("request_type")),title:short(fields.get("title"),180),details:short(fields.get("details"),4000)};
 const {error}=await client.from("advisor_requests").insert(data);
 if(error)throw error;
 msg("Request submitted to your project's advisor queue.");await fetchAll();
}
async function insertNote(form){
 const fields=new FormData(form);
 const data={project_id:project.id,authored_by:user.id,category:String(fields.get("category")),title:short(fields.get("title"),180),body:short(fields.get("body"),4000)};
 const {error}=await client.from("advisor_notes").insert(data);
 if(error)throw error;
 msg("Your recommendation is now visible to the researcher.");await fetchAll();
}
async function decide(form){
 const fd=new FormData(form);
 const decision=String(fd.get("decision"));if(!allowedDecisions.includes(decision))throw new Error("Invalid decision.");
 const feedback=short(fd.get("feedback"),4000);
 if(feedback.length<3)throw new Error("Enter at least three characters of feedback.");
 if(!window.confirm("Submit this "+decision.replaceAll("_"," ")+" decision? This cannot be edited in the current version."))return;
 const {error}=await client.rpc("respond_to_advisor_request",{
   p_request_id:form.dataset.requestId,p_decision:decision,p_feedback:feedback
 });
 if(error)throw error;
 msg("Decision saved with your suggestion.");await fetchAll();
}
function previewShare(form){
 preview=buildAllowlistedSnapshot(form);
 const pre=document.getElementById("publish-preview");
 if(pre)pre.textContent=JSON.stringify(preview,null,2);
 msg("Review the exact fields shown in the preview. Nothing has been uploaded yet.");
}
async function publish(form){
 const updated=buildAllowlistedSnapshot(form);
 if(!preview||JSON.stringify(preview)!==JSON.stringify(updated))throw new Error("Preview your current sharing choices before publishing.");
 if(!window.confirm("Publish exactly the previewed fields to the authorized PI dashboard? Private notes and files are excluded."))return;
 const {error}=await client.from("published_snapshots").insert({project_id:project.id,published_by:user.id,payload:updated});
 if(error)throw error;
 preview=null;msg("Selected progress published successfully.");await fetchAll();
}
root.addEventListener("submit",async event=>{
 const form=event.target;if(!(form instanceof HTMLFormElement))return;
 event.preventDefault();
 if(!client||loading)return;
 if(!form.reportValidity())return;
 try{
  setBusy(true);notice="";isError=false;
  if(form.id==="login-form"){
   const fields=new FormData(form),email=String(fields.get("email")).trim();
   if(event.submitter?.dataset.method==="magic-link"){
    form.elements.password.value="";
    await signIn(email);
   }else{
    try{await signInWithPassword(email,String(fields.get("password")||""))}
    finally{form.elements.password.value=""}
   }
  }
  if(form.id==="request-form")await insertRequest(form);
  if(form.id==="note-form")await insertNote(form);
  if(form.classList.contains("decision-form"))await decide(form);
  if(form.id==="publish-form")await publish(form);
 }catch(e){msg("Action not completed: "+(e?.message||String(e)),true)}
 finally{setBusy(false)}
});
root.addEventListener("click",async event=>{
 if(event.target.closest('[data-action="revoke"]')){
  if(!client||!project||mode!=="owner"||loading)return;
  if(!window.confirm("Revoke all previously published progress snapshots? New database reads by your PI will be blocked. This cannot remove screenshots or copies already saved."))return;
  try{
   setBusy(true);
   const {error}=await client.rpc("revoke_project_snapshots",{p_project_id:project.id});
   if(error)throw error;
   msg("Previously published progress has been revoked.");
   await fetchAll();
  }catch(e){msg("Could not revoke shared progress: "+e.message,true)}
  finally{setBusy(false)}
  return;
 }
 if(event.target.closest('[data-action="preview"]')){
  try{const f=document.getElementById("publish-form");if(!f?.reportValidity())return;previewShare(f)}
  catch(e){msg(e?.message||"Preview failed.",true)}
 }
});
root.addEventListener("change",async event=>{
 if(event.target.id==="project-picker"){
  const id=event.target.value;
  if(!allProjects.some(p=>p.id===id))return;
  project=allProjects.find(p=>p.id===id);
  try{await fetchAll()}catch(e){msg(e.message,true)}
 }
 if(event.target.closest("#publish-form"))preview=null;
});
document.getElementById("signout-button").addEventListener("click",async ()=>{
 if(!client)return;
 await client.auth.signOut();user=null;project=null;requests=[];notes=[];latest=null;preview=null;notice="";
 renderLogin();
});
async function start(){
 if(!["owner","advisor"].includes(mode)){busyText("Invalid portal mode.");return}
 if(!config.supabaseUrl||!config.supabasePublishableKey){renderSetup();return}
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.supabaseUrl)){
  busyText("Invalid Supabase project URL in advisor-config.js.");return;
 }
 try{
  busyText("Connecting to secure advisor service…");
  const {createClient}=await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm");
  client=createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  await initialize();
  client.auth.onAuthStateChange((event)=>{
   if(event==="SIGNED_IN"||event==="SIGNED_OUT"){setTimeout(async ()=>{
    try{notice="";await initialize()}catch(e){msg("Could not load your authorized project: "+e.message,true)}
   },0)}
  });
 }catch(e){
  busyText("Secure connection could not be started. Check the Supabase configuration, email redirects and network. No progress was uploaded.");
  console.error("Advisor portal initialization failed:",e);
 }
}
start();
