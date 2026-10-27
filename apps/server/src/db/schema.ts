import type { Surreal } from "surrealdb";

/**
 * Database schema, applied idempotently at startup (`OVERWRITE` keeps definitions in sync with code).
 * Data model: docs/SPEC.md section 5. Tables must be defined before LIVE SELECT can subscribe.
 */
export const SCHEMA = /* surql */ `
DEFINE TABLE OVERWRITE user SCHEMAFULL;
DEFINE FIELD OVERWRITE name ON user TYPE string;
DEFINE FIELD OVERWRITE role ON user TYPE string ASSERT $value IN ["owner"];
DEFINE FIELD OVERWRITE created_at ON user TYPE datetime DEFAULT time::now();

DEFINE TABLE OVERWRITE chat SCHEMAFULL;
DEFINE FIELD OVERWRITE kind ON chat TYPE string ASSERT $value IN ["direct", "group", "system"];
DEFINE FIELD OVERWRITE title ON chat TYPE string;
DEFINE FIELD OVERWRITE project ON chat TYPE option<string>;
DEFINE FIELD OVERWRITE created_at ON chat TYPE datetime DEFAULT time::now();
DEFINE FIELD OVERWRITE last_message_at ON chat TYPE option<datetime>;
DEFINE FIELD OVERWRITE last_message_preview ON chat TYPE option<string>;

DEFINE TABLE OVERWRITE member SCHEMAFULL;
DEFINE FIELD OVERWRITE chat ON member TYPE record<chat>;
DEFINE FIELD OVERWRITE participant ON member TYPE object;
DEFINE FIELD OVERWRITE participant.kind ON member TYPE string ASSERT $value IN ["user", "agent", "bot"];
DEFINE FIELD OVERWRITE participant.id ON member TYPE string;
DEFINE FIELD OVERWRITE role ON member TYPE string ASSERT $value IN ["owner", "member"];
DEFINE FIELD OVERWRITE joined_at ON member TYPE datetime DEFAULT time::now();
DEFINE INDEX OVERWRITE member_unique ON member FIELDS chat, participant.kind, participant.id UNIQUE;

DEFINE TABLE OVERWRITE message SCHEMAFULL;
DEFINE FIELD OVERWRITE chat ON message TYPE record<chat>;
DEFINE FIELD OVERWRITE author ON message TYPE object;
DEFINE FIELD OVERWRITE author.kind ON message TYPE string ASSERT $value IN ["user", "agent", "bot"];
DEFINE FIELD OVERWRITE author.id ON message TYPE string;
DEFINE FIELD OVERWRITE kind ON message TYPE string ASSERT $value IN ["text", "card", "system"];
DEFINE FIELD OVERWRITE body ON message TYPE string;
DEFINE FIELD OVERWRITE card ON message TYPE option<object> FLEXIBLE;
DEFINE FIELD OVERWRITE reply_to ON message TYPE option<record<message>>;
DEFINE FIELD OVERWRITE mentions ON message TYPE array<string> DEFAULT [];
DEFINE FIELD OVERWRITE status ON message TYPE string ASSERT $value IN ["streaming", "final", "error"];
DEFINE FIELD OVERWRITE chain_depth ON message TYPE int DEFAULT 0;
DEFINE FIELD OVERWRITE run ON message TYPE option<string>;
DEFINE FIELD OVERWRITE usage ON message TYPE option<object> FLEXIBLE;
DEFINE FIELD OVERWRITE error ON message TYPE option<string>;
DEFINE FIELD OVERWRITE created_at ON message TYPE datetime DEFAULT time::now();
DEFINE FIELD OVERWRITE updated_at ON message TYPE datetime DEFAULT time::now();
DEFINE INDEX OVERWRITE message_chat ON message FIELDS chat;

DEFINE TABLE OVERWRITE project SCHEMAFULL;
DEFINE FIELD OVERWRITE name ON project TYPE string;
DEFINE FIELD OVERWRITE status ON project TYPE string ASSERT $value IN ["active", "done"];
DEFINE FIELD OVERWRITE chat ON project TYPE record<chat>;
DEFINE FIELD OVERWRITE repo_path ON project TYPE string;
DEFINE FIELD OVERWRITE budget_usd ON project TYPE option<float>;
DEFINE FIELD OVERWRITE created_at ON project TYPE datetime DEFAULT time::now();

DEFINE TABLE OVERWRITE approval SCHEMAFULL;
DEFINE FIELD OVERWRITE kind ON approval TYPE string;
DEFINE FIELD OVERWRITE requested_by ON approval TYPE string;
DEFINE FIELD OVERWRITE chat ON approval TYPE record<chat>;
DEFINE FIELD OVERWRITE message ON approval TYPE option<record<message>>;
DEFINE FIELD OVERWRITE title ON approval TYPE string;
DEFINE FIELD OVERWRITE why ON approval TYPE string;
DEFINE FIELD OVERWRITE preview ON approval TYPE string;
DEFINE FIELD OVERWRITE payload ON approval TYPE object FLEXIBLE;
DEFINE FIELD OVERWRITE status ON approval TYPE string ASSERT $value IN ["pending", "approved", "rejected", "failed"];
DEFINE FIELD OVERWRITE result ON approval TYPE option<string>;
DEFINE FIELD OVERWRITE try_css ON approval TYPE option<string>;
DEFINE FIELD OVERWRITE decided_by ON approval TYPE option<string>;
DEFINE FIELD OVERWRITE decided_at ON approval TYPE option<datetime>;
DEFINE FIELD OVERWRITE created_at ON approval TYPE datetime DEFAULT time::now();

DEFINE TABLE OVERWRITE task SCHEMAFULL;
DEFINE FIELD OVERWRITE project ON task TYPE string;
DEFINE FIELD OVERWRITE title ON task TYPE string;
DEFINE FIELD OVERWRITE description ON task TYPE string;
DEFINE FIELD OVERWRITE assignee ON task TYPE string;
DEFINE FIELD OVERWRITE status ON task TYPE string ASSERT $value IN ["todo", "doing", "done", "blocked"];
DEFINE FIELD OVERWRITE created_by ON task TYPE string;
DEFINE FIELD OVERWRITE note ON task TYPE option<string>;
DEFINE FIELD OVERWRITE message ON task TYPE option<record<message>>;
DEFINE FIELD OVERWRITE created_at ON task TYPE datetime DEFAULT time::now();
DEFINE FIELD OVERWRITE updated_at ON task TYPE datetime DEFAULT time::now();
DEFINE INDEX OVERWRITE task_project ON task FIELDS project;

DEFINE TABLE OVERWRITE skill_index SCHEMAFULL;
DEFINE FIELD OVERWRITE active_ref ON skill_index TYPE string;
DEFINE FIELD OVERWRITE updated_at ON skill_index TYPE datetime DEFAULT time::now();

DEFINE TABLE OVERWRITE alert_state SCHEMAFULL;
DEFINE FIELD OVERWRITE message ON alert_state TYPE record<message>;
DEFINE FIELD OVERWRITE count ON alert_state TYPE int;
DEFINE FIELD OVERWRITE last_ms ON alert_state TYPE number;

DEFINE TABLE OVERWRITE job SCHEMAFULL;
DEFINE FIELD OVERWRITE name ON job TYPE string;
DEFINE FIELD OVERWRITE schedule ON job TYPE string;
DEFINE FIELD OVERWRITE chat ON job TYPE record<chat>;
DEFINE FIELD OVERWRITE agent ON job TYPE string;
DEFINE FIELD OVERWRITE prompt ON job TYPE string;
DEFINE FIELD OVERWRITE status ON job TYPE string ASSERT $value IN ["active", "paused"];
DEFINE FIELD OVERWRITE next_run_at ON job TYPE option<datetime>;
DEFINE FIELD OVERWRITE last_run_at ON job TYPE option<datetime>;
DEFINE FIELD OVERWRITE last_error ON job TYPE option<string>;
DEFINE FIELD OVERWRITE created_at ON job TYPE datetime DEFAULT time::now();

DEFINE TABLE OVERWRITE setting SCHEMALESS;

DEFINE TABLE OVERWRITE extension_state SCHEMAFULL;
DEFINE FIELD OVERWRITE version ON extension_state TYPE string;
DEFINE FIELD OVERWRITE enabled ON extension_state TYPE bool;
DEFINE FIELD OVERWRITE granted_permissions ON extension_state TYPE array<string>;
DEFINE FIELD OVERWRITE errors ON extension_state TYPE int DEFAULT 0;

DEFINE TABLE OVERWRITE device SCHEMAFULL;
DEFINE FIELD OVERWRITE name ON device TYPE string;
DEFINE FIELD OVERWRITE token_hash ON device TYPE string;
DEFINE FIELD OVERWRITE revoked ON device TYPE bool DEFAULT false;
DEFINE FIELD OVERWRITE push ON device TYPE option<object> FLEXIBLE;
DEFINE FIELD OVERWRITE created_at ON device TYPE datetime DEFAULT time::now();
DEFINE FIELD OVERWRITE last_seen_at ON device TYPE option<datetime>;
DEFINE INDEX OVERWRITE device_token ON device FIELDS token_hash UNIQUE;

DEFINE TABLE OVERWRITE run SCHEMAFULL;
DEFINE FIELD OVERWRITE agent ON run TYPE string;
DEFINE FIELD OVERWRITE chat ON run TYPE record<chat>;
DEFINE FIELD OVERWRITE project ON run TYPE option<string>;
DEFINE FIELD OVERWRITE trigger_message ON run TYPE option<record<message>>;
DEFINE FIELD OVERWRITE reply_message ON run TYPE option<record<message>>;
DEFINE FIELD OVERWRITE provider ON run TYPE string;
DEFINE FIELD OVERWRITE model ON run TYPE option<string>;
DEFINE FIELD OVERWRITE status ON run TYPE string ASSERT $value IN ["running", "done", "error", "stopped"];
DEFINE FIELD OVERWRITE tokens_in ON run TYPE int DEFAULT 0;
DEFINE FIELD OVERWRITE tokens_out ON run TYPE int DEFAULT 0;
DEFINE FIELD OVERWRITE cost_usd ON run TYPE float DEFAULT 0;
DEFINE FIELD OVERWRITE tool_calls ON run TYPE array<object> FLEXIBLE DEFAULT [];
DEFINE FIELD OVERWRITE started_at ON run TYPE datetime DEFAULT time::now();
DEFINE FIELD OVERWRITE ended_at ON run TYPE option<datetime>;
DEFINE FIELD OVERWRITE error ON run TYPE option<string>;
DEFINE INDEX OVERWRITE run_agent ON run FIELDS agent;

DEFINE TABLE OVERWRITE memory SCHEMAFULL;
DEFINE FIELD OVERWRITE scope ON memory TYPE string ASSERT $value IN ["agent", "project"];
DEFINE FIELD OVERWRITE owner ON memory TYPE string;
DEFINE FIELD OVERWRITE text ON memory TYPE string;
DEFINE FIELD OVERWRITE keys ON memory TYPE string;
DEFINE FIELD OVERWRITE author ON memory TYPE string;
DEFINE FIELD OVERWRITE chat ON memory TYPE option<string>;
DEFINE FIELD OVERWRITE embedding ON memory TYPE option<array<float>>;
DEFINE FIELD OVERWRITE embed_model ON memory TYPE option<string>;
DEFINE FIELD OVERWRITE created_at ON memory TYPE datetime DEFAULT time::now();
DEFINE INDEX OVERWRITE memory_owner ON memory FIELDS scope, owner;
DEFINE ANALYZER OVERWRITE memory_words TOKENIZERS blank, class, punct FILTERS lowercase, snowball(english);
DEFINE ANALYZER OVERWRITE memory_keys TOKENIZERS blank FILTERS lowercase;
DEFINE INDEX OVERWRITE memory_text ON memory FIELDS text FULLTEXT ANALYZER memory_words BM25;
DEFINE INDEX OVERWRITE memory_keys ON memory FIELDS keys FULLTEXT ANALYZER memory_keys BM25;
`;

export async function applySchema(surreal: Surreal): Promise<void> {
  await surreal.query(SCHEMA).collect();
}
