import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { Client } from "pg";
config({ quiet: true });
const url = process.env.INTEGRATION_DATABASE_URL;

test("investigation foundation PostgreSQL constraints and rollback cleanup", { skip: !url }, async t => {
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(url!).hostname));
  const db = new Client({ connectionString: url });
  const userId = randomUUID(), orgA = randomUUID(), orgB = randomUUID();
  const creatorA = randomUUID(), authorA = randomUUID(), authorB = randomUUID();
  const incidentA = randomUUID(), incidentB = randomUUID(), evidenceId = randomUUID();
  const ids: string[] = [evidenceId];
  await db.connect();
  const evidence = (changes: Partial<{ organizationId: string; incidentId: string; authorId: string; type: string; title: string; content: string; sourceUrl: string | null }> = {}) => {
    const id = randomUUID(); ids.push(id);
    const data = { organizationId: orgA, incidentId: incidentA, authorId: authorA, type: "OBSERVATION", title: "Fixture", content: "Supplied context", sourceUrl: null as string | null, ...changes };
    return db.query('INSERT INTO "IncidentEvidence" (id,"organizationId","incidentId","createdByMemberId",type,title,content,"sourceUrl") VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [id,data.organizationId,data.incidentId,data.authorId,data.type,data.title,data.content,data.sourceUrl]);
  };
  const comment = (body: string, kind?: string, incidentId = incidentA, authorId = authorA) => {
    const id = randomUUID(); ids.push(id);
    return kind === undefined ? db.query('INSERT INTO "Comment" (id,"organizationId","incidentId","authorMemberId",body,"updatedAt") VALUES ($1,$2,$3,$4,$5,now()) RETURNING kind',[id,orgA,incidentId,authorId,body]) :
      db.query('INSERT INTO "Comment" (id,"organizationId","incidentId","authorMemberId",body,kind,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now()) RETURNING kind',[id,orgA,incidentId,authorId,body,kind]);
  };
  async function check(name: string, action: () => Promise<unknown>, failure?: { code: string; constraint?: string }) {
    await t.test(name, async () => {
      await db.query('SAVEPOINT constraint_case');
      try {
        if (!failure) await action();
        else {
          let caught: unknown;
          try { await action(); } catch (error) { caught = error; }
          const error = caught as { code?: string; constraint?: string } | undefined;
          assert.equal(error?.code, failure.code, "Expected PostgreSQL error category");
          if (failure.constraint) assert.equal(error?.constraint, failure.constraint);
        }
      } finally { await db.query('ROLLBACK TO SAVEPOINT constraint_case'); await db.query('RELEASE SAVEPOINT constraint_case'); }
    });
  }
  try {
    await db.query('BEGIN');
    await db.query('INSERT INTO "User" (id,email,"updatedAt") VALUES ($1,$2,now())',[userId,`${userId}@example.invalid`]);
    await db.query('INSERT INTO "Organization" (id,name,slug,"updatedAt") VALUES ($1,$3,$4,now()),($2,$3,$5,now())',[orgA,orgB,'Constraint fixture',orgA,orgB]);
    await db.query('INSERT INTO "OrganizationMember" (id,"organizationId","userId","updatedAt") VALUES ($1,$2,$3,now()),($4,$5,$3,now())',[creatorA,orgA,userId,authorB,orgB]);
    // Distinct contributor has no creator references, isolating the evidence-author RESTRICT.
    const contributorUser = randomUUID(); ids.push(contributorUser);
    await db.query('INSERT INTO "User" (id,email,"updatedAt") VALUES ($1,$2,now())',[contributorUser,`${contributorUser}@example.invalid`]);
    await db.query('INSERT INTO "OrganizationMember" (id,"organizationId","userId","updatedAt") VALUES ($1,$2,$3,now())',[authorA,orgA,contributorUser]);
    await db.query('INSERT INTO "Incident" (id,"organizationId","createdByMemberId",title,"updatedAt") VALUES ($1,$2,$3,$7,now()),($4,$5,$6,$7,now())',[incidentA,orgA,creatorA,incidentB,orgB,authorB,'Constraint fixture']);
    await db.query('INSERT INTO "IncidentEvidence" (id,"organizationId","incidentId","createdByMemberId",type,title,content) VALUES ($1,$2,$3,$4,$5,$6,$7)',[evidenceId,orgA,incidentA,authorA,'OBSERVATION','Fixture','Context']);
    await check('valid same-tenant evidence accepted',()=>evidence());
    await check('cross-tenant Incident rejected',()=>evidence({incidentId:incidentB}),{code:'23503',constraint:'IncidentEvidence_organizationId_incidentId_fkey'});
    await check('cross-tenant contributor rejected',()=>evidence({authorId:authorB}),{code:'23503',constraint:'IncidentEvidence_organizationId_createdByMemberId_fkey'});
    await check('invalid evidence enum rejected',()=>evidence({type:'INVALID'}),{code:'22P02'});
    await check('invalid CommentKind rejected',()=>comment('Valid','INVALID'),{code:'22P02'});
    for (const [name,body] of [['valid','Valid'],['exact maximum','x'.repeat(10000)]] as const) await check(`Comment ${name} accepted`,()=>comment(body));
    for (const [name,body] of [['empty',''],['ASCII whitespace',' \t\n\r\f\v'],['over maximum','x'.repeat(10001)]] as const) await check(`Comment ${name} rejected`,()=>comment(body),{code:'23514',constraint:'Comment_body_bounds_check'});
    for (const [field,max,constraint] of [['title',200,'IncidentEvidence_title_bounds_check'],['content',20000,'IncidentEvidence_content_bounds_check']] as const) {
      for (const [name,value] of [['valid','Valid'],['exact maximum','x'.repeat(max)]] as const) await check(`Evidence ${field} ${name} accepted`,()=>evidence({[field]:value}));
      for (const [name,value] of [['empty',''],['ASCII whitespace',' \t\n\r\f\v'],['over maximum','x'.repeat(max+1)]] as const) await check(`Evidence ${field} ${name} rejected`,()=>evidence({[field]:value}),{code:'23514',constraint});
    }
    for (const [name,value] of [['NULL',null],['normal','https://example.invalid'],['exact maximum','x'.repeat(2048)]] as const) await check(`sourceUrl ${name} accepted`,()=>evidence({sourceUrl:value}));
    await check('sourceUrl over maximum rejected',()=>evidence({sourceUrl:'x'.repeat(2049)}),{code:'23514',constraint:'IncidentEvidence_sourceUrl_length_check'});
    for (const kind of [undefined,'HYPOTHESIS','ACTION']) await check(`Comment ${kind??'default NOTE'} accepted`,async()=>{const row=await comment('Valid',kind);assert.equal(row.rows[0].kind,kind??'NOTE');});
    await check('Incident delete RESTRICT',()=>db.query('DELETE FROM "Incident" WHERE id=$1',[incidentA]),{code:'23001',constraint:'IncidentEvidence_organizationId_incidentId_fkey'});
    await check('author membership delete RESTRICT',()=>db.query('DELETE FROM "OrganizationMember" WHERE id=$1',[authorA]),{code:'23001',constraint:'IncidentEvidence_organizationId_createdByMemberId_fkey'});
    await check('Organization delete RESTRICT',()=>db.query('DELETE FROM "Organization" WHERE id=$1',[orgA]),{code:'23001'});
    await check('Incident update RESTRICT',()=>db.query('UPDATE "Incident" SET id=$1 WHERE id=$2',[randomUUID(),incidentA]),{code:'23001',constraint:'IncidentEvidence_organizationId_incidentId_fkey'});
    await check('author membership update RESTRICT',()=>db.query('UPDATE "OrganizationMember" SET id=$1 WHERE id=$2',[randomUUID(),authorA]),{code:'23001',constraint:'IncidentEvidence_organizationId_createdByMemberId_fkey'});
    await check('existing Incident creator tenant constraint',()=>db.query('UPDATE "Incident" SET "createdByMemberId"=$1 WHERE id=$2',[authorB,incidentA]),{code:'23503',constraint:'Incident_organizationId_createdByMemberId_fkey'});
    await check('existing Comment parent tenant constraint',()=>comment('Valid',undefined,incidentB),{code:'23503',constraint:'Comment_organizationId_incidentId_fkey'});
    await check('existing Comment author tenant constraint',()=>comment('Valid',undefined,incidentA,authorB),{code:'23503',constraint:'Comment_organizationId_authorMemberId_fkey'});
    for (const [name,incidentId,actorId,constraint] of [['parent',incidentB,authorA,'ActivityLog_organizationId_incidentId_fkey'],['actor',incidentA,authorB,'ActivityLog_organizationId_actorMemberId_fkey']] as const) await check(`existing ActivityLog ${name} tenant constraint`,()=>db.query('INSERT INTO "ActivityLog" (id,"organizationId","incidentId","actorMemberId","actorType","eventType") VALUES ($1,$2,$3,$4,$5,$6)',[randomUUID(),orgA,incidentId,actorId,'USER','EVIDENCE_ADDED']),{code:'23503',constraint});
    await check('Unicode length diagnostic: one code point, two JS units',async()=>{assert.equal('😀'.length,2);assert.equal((await db.query('SELECT char_length($1::text) AS n',['😀'])).rows[0].n,1);});
  } finally {
    try {
      await db.query('ROLLBACK');
      for (const [table,key,values] of [['Organization','id',[orgA,orgB]],['User','id',[userId,...ids]],['OrganizationMember','id',[creatorA,authorA,authorB]],['Incident','id',[incidentA,incidentB]],['IncidentEvidence','organizationId',[orgA,orgB]],['Comment','organizationId',[orgA,orgB]],['ActivityLog','organizationId',[orgA,orgB]]] as const) {
        assert.equal(Number((await db.query(`SELECT count(*) AS n FROM "${table}" WHERE "${key}"=ANY($1::uuid[])`,[values])).rows[0].n),0,'Fixture rollback cleanup');
      }
    } finally { await db.end(); }
  }
});
