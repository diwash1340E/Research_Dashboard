/* RL Survey Lab — owner-only workspace entry; local data is not migrated or uploaded. */
"use strict";
const gate=document.getElementById("workspace-gate");
const app=document.getElementById("app");
const modal=document.getElementById("modal-root");
const toast=document.getElementById("toast");
const form=document.getElementById("workspace-login");
const status=document.getElementById("workspace-status");
const switchAccount=document.getElementById("workspace-switch");
const signout=document.getElementById("workspace-signout");
const config=window.RL_ADVISOR_CONFIG||{};
let client=null, revision=0, loaded=false, ready=false, ownerId=null, signingOut=false, reloading=false;
function say(message){status.textContent=message}
function hideWorkspace(){
 app.hidden=true;modal.hidden=true;toast.hidden=true;gate.hidden=false;
}
function showWorkspace(){
 gate.hidden=true;app.hidden=false;modal.hidden=false;toast.hidden=false;
}
function lockAndReload(){
 hideWorkspace();
 if(!reloading){reloading=true;window.location.reload()}
}
function deny(message,{login=false,switchUser=false}={}){
 if(loaded){lockAndReload();return}
 hideWorkspace();say(message);form.hidden=!login;switchAccount.hidden=!switchUser;
}
function unlock(id){
 if(loaded&&ownerId!==id){lockAndReload();return}
 ownerId=id;
 if(!loaded){
  loaded=true;
  const script=document.createElement("script");
  script.src="app.js?v=logo-v2";
  script.onload=()=>{if(!signingOut&&!reloading&&ownerId===id){ready=true;showWorkspace()}};
  script.onerror=()=>{hideWorkspace();say("The workspace could not load. Refresh to try again.");form.hidden=true;switchAccount.hidden=false};
  // Load the existing workspace only after verifying project ownership.
  document.body.appendChild(script);
 }
 if(ready)showWorkspace();
}
async function checkAccess(){
 if(!client||signingOut||reloading)return;
 const seq=++revision;
 try{
  const {data,error}=await client.auth.getUser();
  if(seq!==revision||signingOut||reloading)return;
  if(error&&error.name!=="AuthSessionMissingError")throw error;
  const user=data?.user;
  if(!user){deny("Sign in using your researcher email and password.",{login:true});return}
  const {data:projects,error:projectError}=await client.from("projects")
    .select("id").eq("owner_user_id",user.id).limit(1);
  if(seq!==revision||signingOut||reloading)return;
  if(projectError)throw projectError;
  if(!projects?.length){deny("No workspace access. Only an authorized project owner may open the researcher workspace.",{switchUser:true});return}
  unlock(user.id);
 }catch{
  if(seq===revision&&!signingOut&&!reloading)deny("Unable to verify workspace access. Check your connection and refresh.",{switchUser:true});
 }
}
form.addEventListener("submit",async event=>{
 event.preventDefault();
 if(!client||signingOut||!form.reportValidity())return;
 const button=form.querySelector('button[type="submit"]');
 if(button.disabled)return;
 button.disabled=true;
 const email=form.elements.email.value.trim(),password=form.elements.password.value;
 try{
  say("Signing in…");
  const {error}=await client.auth.signInWithPassword({email,password});
  if(error)throw error;
  await checkAccess();
 }catch{say("Sign-in failed. Check your email and password and try again.")}
 finally{form.elements.password.value="";button.disabled=false}
});
async function signOut(){
 if(!client||reloading)return;
 signingOut=true;++revision;hideWorkspace();form.hidden=true;switchAccount.hidden=true;say("Signing out…");
 try{
  const {error}=await client.auth.signOut({scope:"local"});
  if(error)throw error;
  lockAndReload();
 }catch{
  say("Could not complete sign-out. Your workspace is locked. Retry sign-out.");
  switchAccount.hidden=false;
 }
}
switchAccount.addEventListener("click",signOut);
signout.addEventListener("click",signOut);
window.addEventListener("pagehide",hideWorkspace);
window.addEventListener("pageshow",event=>{if(event.persisted)void checkAccess()});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")void checkAccess()});
async function start(){
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.supabaseUrl||"")||!config.supabasePublishableKey){
  deny("Workspace authentication is not configured. Check advisor-config.js.");return;
 }
 try{
  const {createClient}=await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm");
  client=createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  client.auth.onAuthStateChange((event,session)=>{
   if(event==="SIGNED_OUT"||(loaded&&session?.user?.id&&session.user.id!==ownerId)){
    ++revision;hideWorkspace();
    if(loaded||signingOut){lockAndReload();return}
   }
   if(["SIGNED_IN","SIGNED_OUT","TOKEN_REFRESHED","USER_UPDATED"].includes(event)){
    window.setTimeout(()=>void checkAccess(),0);
   }
  });
  await checkAccess();
 }catch{deny("Unable to connect to the secure workspace. Check your configuration and connection, then refresh.")}
}
start();
