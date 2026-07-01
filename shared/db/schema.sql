-- DB Schema Dump: m1087
-- Generated   : 2026-07-01 07:37:29
-- Schemas     : public, enroll
-- NOTE: DDL only — no data

-- ============================================================
--  TABLES — schema: public
-- ============================================================

-- public.airbnb_calendar
CREATE TABLE "public"."airbnb_calendar" (
    "id" BIGINT DEFAULT nextval('airbnb_calendar_id_seq'::regclass) NOT NULL,
    "room_id" INTEGER NOT NULL,
    "calendar_date" DATE NOT NULL,
    "is_available" BOOLEAN NOT NULL,
    "scraped_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    "scrape_run_id" BIGINT,
    PRIMARY KEY ("id")
);
-- rows: 4,380

-- public.devices
CREATE TABLE "public"."devices" (
    "id" INTEGER DEFAULT nextval('devices_id_seq'::regclass) NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT DEFAULT 'frigate'::text NOT NULL,
    "internal_url" TEXT,
    "public_url" TEXT,
    "username" TEXT,
    "password" TEXT,
    "extra" JSONB DEFAULT '{}'::jsonb,
    "enabled" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    PRIMARY KEY ("id")
);
-- rows: 1

-- public.gate_events
CREATE TABLE "public"."gate_events" (
    "id" BIGINT DEFAULT nextval('gate_events_id_seq'::regclass) NOT NULL,
    "device_name" VARCHAR(64) NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "raw_hex" VARCHAR(8),
    "method" VARCHAR(16),
    "door_state" VARCHAR(8),
    "event_time" TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    "inserted_at" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY ("id")
);
-- rows: 1,994

-- public.gate_session_clips
CREATE TABLE "public"."gate_session_clips" (
    "id" INTEGER DEFAULT nextval('gate_session_clips_id_seq'::regclass) NOT NULL,
    "session_id" BIGINT,
    "unlock_id" BIGINT,
    "event_time_vn" TIMESTAMP WITH TIME ZONE NOT NULL,
    "direction" TEXT NOT NULL,
    "user_name" TEXT,
    "label" TEXT,
    "method" TEXT,
    "raw_hex" TEXT,
    "frigate_event_id" TEXT NOT NULL,
    "camera" TEXT NOT NULL,
    "frigate_label" TEXT,
    "frigate_score" NUMERIC(5,4),
    "event_start_time" TIMESTAMP WITH TIME ZONE,
    "event_end_time" TIMESTAMP WITH TIME ZONE,
    "delta_seconds" NUMERIC(8,3),
    "snapshot_url" TEXT,
    "clip_url" TEXT,
    "clip_finalized" BOOLEAN DEFAULT false,
    "codec" TEXT,
    "face_label" TEXT,
    "face_confidence" NUMERIC(5,4),
    "face_processed_at" TIMESTAMP WITH TIME ZONE,
    "match_score" NUMERIC(8,4),
    "is_best_match" BOOLEAN DEFAULT false,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "manual_best_match" BOOLEAN DEFAULT false NOT NULL,
    "manual_reviewed_by" TEXT,
    "manual_reviewed_at" TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY ("id")
);
-- rows: 4,279

-- public.mapping_runs
CREATE TABLE "public"."mapping_runs" (
    "id" INTEGER DEFAULT nextval('mapping_runs_id_seq'::regclass) NOT NULL,
    "ran_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "sessions_scanned" INTEGER,
    "events_queried" INTEGER,
    "matches_found" INTEGER,
    "skipped_active" INTEGER,
    "time_window_sec" INTEGER,
    "notes" TEXT,
    PRIMARY KEY ("id")
);
-- rows: 3,503

-- public.poll_state
CREATE TABLE "public"."poll_state" (
    "device_id" VARCHAR(64) NOT NULL,
    "last_ts_ms" BIGINT DEFAULT 0 NOT NULL,
    "updated_at" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY ("device_id")
);
-- rows: 1

-- public.rooms
CREATE TABLE "public"."rooms" (
    "id" INTEGER DEFAULT nextval('rooms_id_seq'::regclass) NOT NULL,
    "room_code" VARCHAR(10),
    "floor" SMALLINT,
    "position" CHAR(2),
    "airbnb_listing_id" VARCHAR(30),
    "airbnb_url" TEXT,
    "is_active" BOOLEAN DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    PRIMARY KEY ("id")
);
-- rows: 12

-- public.scrape_runs
CREATE TABLE "public"."scrape_runs" (
    "id" BIGINT DEFAULT nextval('scrape_runs_id_seq'::regclass) NOT NULL,
    "room_id" INTEGER NOT NULL,
    "triggered_by" VARCHAR(20) DEFAULT 'cron'::character varying NOT NULL,
    "started_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    "finished_at" TIMESTAMP WITH TIME ZONE,
    "status" VARCHAR(10) DEFAULT 'running'::character varying NOT NULL,
    "skip_reason" VARCHAR(50),
    "days_fetched" INTEGER,
    "days_updated" INTEGER,
    "error_message" TEXT,
    "today_available" BOOLEAN,
    "tomorrow_available" BOOLEAN,
    PRIMARY KEY ("id")
);
-- rows: 84

-- public.unlock_map
CREATE TABLE "public"."unlock_map" (
    "id" INTEGER DEFAULT nextval('unlock_map_id_seq'::regclass) NOT NULL,
    "hex_key" VARCHAR(8) NOT NULL,
    "device_name" VARCHAR(64) NOT NULL,
    "user_name" VARCHAR(64) NOT NULL,
    "label" VARCHAR(64) NOT NULL,
    "method" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    "updated_at" TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY ("id")
);
-- rows: 20

-- public.video_clips
CREATE TABLE "public"."video_clips" (
    "clip_id" UUID DEFAULT gen_random_uuid() NOT NULL,
    "request_id" UUID NOT NULL,
    "camera_id" VARCHAR(3) NOT NULL,
    "clip_start" TIMESTAMP WITH TIME ZONE NOT NULL,
    "clip_end" TIMESTAMP WITH TIME ZONE NOT NULL,
    "status" video_status DEFAULT 'pending'::video_status NOT NULL,
    "retry_count" SMALLINT DEFAULT 0 NOT NULL,
    "retry_after" TIMESTAMP WITH TIME ZONE,
    "dav_temp_path" TEXT,
    "mp4_path" TEXT,
    "file_size_bytes" BIGINT,
    "error_message" TEXT,
    "worker_id" TEXT,
    "started_at" TIMESTAMP WITH TIME ZONE,
    "completed_at" TIMESTAMP WITH TIME ZONE,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY ("clip_id")
);
-- rows: 906

-- public.video_extraction_requests
CREATE TABLE "public"."video_extraction_requests" (
    "request_id" UUID DEFAULT gen_random_uuid() NOT NULL,
    "session_id" TEXT NOT NULL,
    "event_time_vn" TIMESTAMP WITH TIME ZONE NOT NULL,
    "direction" VARCHAR(10) NOT NULL,
    "scheduled_after" TIMESTAMP WITH TIME ZONE NOT NULL,
    "overall_status" request_status DEFAULT 'pending'::request_status NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY ("request_id")
);
-- rows: 302

-- public.video_worker_logs
CREATE TABLE "public"."video_worker_logs" (
    "log_id" BIGINT DEFAULT nextval('video_worker_logs_log_id_seq'::regclass) NOT NULL,
    "clip_id" UUID,
    "event_type" VARCHAR(30) NOT NULL,
    "message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY ("log_id")
);
-- rows: 812

-- ============================================================
--  TABLES — schema: enroll
-- ============================================================

-- enroll.camera_clip_results
CREATE TABLE "enroll"."camera_clip_results" (
    "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
    "enroll_session_id" UUID NOT NULL,
    "camera_id" TEXT NOT NULL,
    "camera_order" SMALLINT NOT NULL,
    "frigate_event_id" TEXT,
    "gsc_id" INTEGER,
    "source_type" TEXT NOT NULL,
    "frames_processed" INTEGER DEFAULT 0 NOT NULL,
    "persons_detected" SMALLINT DEFAULT 0 NOT NULL,
    "confidence" DOUBLE PRECISION,
    "face_score" DOUBLE PRECISION,
    "color_score" DOUBLE PRECISION,
    "stopped_here" BOOLEAN DEFAULT false NOT NULL,
    "has_multi_person" BOOLEAN DEFAULT false NOT NULL,
    "has_occlusion" BOOLEAN DEFAULT false NOT NULL,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY ("id")
);
-- rows: 968

-- enroll.enroll_sessions
CREATE TABLE "enroll"."enroll_sessions" (
    "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
    "job_id" BIGINT,
    "door_id" TEXT NOT NULL,
    "unlock_id" TEXT NOT NULL,
    "event_time_vn" TIMESTAMP WITH TIME ZONE NOT NULL,
    "room_label" TEXT NOT NULL,
    "status" TEXT DEFAULT 'processing'::text NOT NULL,
    "person_count" SMALLINT DEFAULT 0 NOT NULL,
    "persons_enrolled" SMALLINT DEFAULT 0 NOT NULL,
    "overall_quality" DOUBLE PRECISION,
    "best_face_score" DOUBLE PRECISION,
    "stopped_at_cam" TEXT,
    "used_video" BOOLEAN DEFAULT false NOT NULL,
    "fetch_ms" INTEGER,
    "extract_ms" INTEGER,
    "total_ms" INTEGER,
    "error_msg" TEXT,
    "warnings" text[],
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    "finished_at" TIMESTAMP WITH TIME ZONE,
    "direction" TEXT DEFAULT 'incoming'::text NOT NULL,
    "recognized_person_id" UUID,
    "recognition_sim" DOUBLE PRECISION,
    PRIMARY KEY ("id")
);
-- rows: 564

-- enroll.job_queue
CREATE TABLE "enroll"."job_queue" (
    "id" BIGINT DEFAULT nextval('enroll.job_queue_id_seq'::regclass) NOT NULL,
    "door_id" TEXT NOT NULL,
    "unlock_id" TEXT NOT NULL,
    "event_time_vn" TIMESTAMP WITH TIME ZONE NOT NULL,
    "room_label" TEXT NOT NULL,
    "status" TEXT DEFAULT 'pending'::text NOT NULL,
    "priority" SMALLINT DEFAULT 5 NOT NULL,
    "attempt_count" SMALLINT DEFAULT 0 NOT NULL,
    "max_attempts" SMALLINT DEFAULT 3 NOT NULL,
    "last_error" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    "scheduled_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    "started_at" TIMESTAMP WITH TIME ZONE,
    "finished_at" TIMESTAMP WITH TIME ZONE,
    "locked_by" TEXT,
    "locked_at" TIMESTAMP WITH TIME ZONE,
    "enroll_session_id" UUID,
    "direction" TEXT DEFAULT 'incoming'::text NOT NULL,
    PRIMARY KEY ("id")
);
-- rows: 564

-- enroll.person_profiles
CREATE TABLE "enroll"."person_profiles" (
    "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
    "display_name" TEXT,
    "known_room" TEXT,
    "confidence_lvl" TEXT DEFAULT 'unknown'::text NOT NULL,
    "face_embedding" vector,
    "face_quality" DOUBLE PRECISION,
    "face_source_cam" TEXT,
    "face_frame_count" INTEGER DEFAULT 0 NOT NULL,
    "age_estimate" SMALLINT,
    "gender" TEXT,
    "color_upper" vector,
    "color_lower" vector,
    "body_ratio" DOUBLE PRECISION,
    "appearance_notes" TEXT,
    "enroll_count" INTEGER DEFAULT 1 NOT NULL,
    "first_seen_ts" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    "last_seen_ts" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    "is_active" BOOLEAN DEFAULT true NOT NULL,
    PRIMARY KEY ("id")
);
-- rows: 186

-- enroll.person_session_map
CREATE TABLE "enroll"."person_session_map" (
    "person_id" UUID NOT NULL,
    "enroll_session_id" UUID NOT NULL,
    "is_new" BOOLEAN DEFAULT false NOT NULL,
    "merge_sim" DOUBLE PRECISION,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY ("person_id", "enroll_session_id")
);
-- rows: 268

-- enroll.room_stays
CREATE TABLE "enroll"."room_stays" (
    "id" UUID DEFAULT uuid_generate_v4() NOT NULL,
    "person_id" UUID NOT NULL,
    "room_id" TEXT NOT NULL,
    "entry_door_id" TEXT,
    "entry_unlock_id" TEXT,
    "entry_ts" TIMESTAMP WITH TIME ZONE,
    "entry_confidence" TEXT,
    "exit_door_id" TEXT,
    "exit_unlock_id" TEXT,
    "exit_ts" TIMESTAMP WITH TIME ZONE,
    "exit_confidence" TEXT,
    "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY ("id")
);
-- rows: 186

-- enroll.worker_heartbeat
CREATE TABLE "enroll"."worker_heartbeat" (
    "worker_id" TEXT NOT NULL,
    "last_beat" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    "status" TEXT DEFAULT 'idle'::text NOT NULL,
    "active_jobs" SMALLINT DEFAULT 0 NOT NULL,
    "max_concurrent" SMALLINT DEFAULT 2 NOT NULL,
    "poll_interval_s" SMALLINT DEFAULT 30 NOT NULL,
    "hostname" TEXT,
    "started_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    PRIMARY KEY ("worker_id")
);
-- rows: 1

-- ============================================================
--  VIEWS — schema: public
-- ============================================================

CREATE OR REPLACE VIEW "public"."gate_events_view" AS
SELECT e.id,
    e.device_name,
    (e.event_time AT TIME ZONE 'Asia/Ho_Chi_Minh'::text) AS event_time_vn,
    e.method,
    e.door_state,
    e.code,
    COALESCE(m.user_name, 'Unknown'::character varying) AS user_name,
    COALESCE(m.label, e.raw_hex) AS label,
    e.raw_hex,
    e.inserted_at
   FROM gate_events e
     LEFT JOIN unlock_map m ON m.hex_key::text = e.raw_hex::text;;

CREATE OR REPLACE VIEW "public"."gate_sessions" AS
WITH unlock_events AS (
         SELECT gate_events.id,
            gate_events.event_time,
            gate_events.method,
            gate_events.raw_hex
           FROM gate_events
          WHERE gate_events.method::text = ANY (ARRAY['password'::character varying::text, 'fingerprint'::character varying::text, 'card'::character varying::text, 'remote'::character varying::text])
        ), door_opens AS (
         SELECT gate_events.id,
            gate_events.event_time
           FROM gate_events
          WHERE gate_events.method::text = 'door_state'::text AND gate_events.door_state::text = 'open'::text
        ), matched AS (
         SELECT DISTINCT ON (d.id) d.id AS door_id,
            d.event_time,
            u.id AS unlock_id,
            u.method,
            u.raw_hex,
            'incoming'::text AS direction
           FROM door_opens d
             JOIN unlock_events u ON u.event_time >= (d.event_time - '00:00:05'::interval) AND u.event_time <= (d.event_time + '00:00:15'::interval)
          ORDER BY d.id, (abs(EXTRACT(epoch FROM u.event_time - d.event_time)))
        ), outgoing AS (
         SELECT d.id AS door_id,
            d.event_time,
            NULL::bigint AS unlock_id,
            NULL::character varying AS method,
            NULL::character varying AS raw_hex,
            'outgoing'::text AS direction
           FROM door_opens d
          WHERE NOT (d.id IN ( SELECT matched.door_id
                   FROM matched))
        )
 SELECT (s.event_time AT TIME ZONE 'Asia/Ho_Chi_Minh'::text) AS event_time_vn,
    s.direction,
    COALESCE(m.user_name, 'Unknown'::character varying) AS user_name,
    COALESCE(m.label, s.raw_hex) AS label,
    s.method,
    s.raw_hex,
    s.door_id,
    s.unlock_id
   FROM ( SELECT matched.door_id,
            matched.event_time,
            matched.unlock_id,
            matched.method,
            matched.raw_hex,
            matched.direction
           FROM matched
        UNION ALL
         SELECT outgoing.door_id,
            outgoing.event_time,
            outgoing.unlock_id,
            outgoing.method,
            outgoing.raw_hex,
            outgoing.direction
           FROM outgoing) s
     LEFT JOIN unlock_map m ON m.hex_key::text = s.raw_hex::text
  ORDER BY s.event_time DESC;;

CREATE OR REPLACE VIEW "public"."gate_sessions_v2" AS
WITH door_opens_raw AS (
         SELECT gate_events.id,
            gate_events.event_time
           FROM gate_events
          WHERE gate_events.method::text = 'door_state'::text AND gate_events.door_state::text = 'open'::text
        ), door_opens_flagged AS (
         SELECT door_opens_raw.id,
            door_opens_raw.event_time,
                CASE
                    WHEN lag(door_opens_raw.event_time) OVER (ORDER BY door_opens_raw.event_time) IS NULL THEN 1
                    WHEN (door_opens_raw.event_time - lag(door_opens_raw.event_time) OVER (ORDER BY door_opens_raw.event_time)) > '00:00:10'::interval THEN 1
                    ELSE 0
                END AS is_new_session
           FROM door_opens_raw
        ), door_opens_grouped AS (
         SELECT door_opens_flagged.id,
            door_opens_flagged.event_time,
            sum(door_opens_flagged.is_new_session) OVER (ORDER BY door_opens_flagged.event_time) AS session_id
           FROM door_opens_flagged
        ), door_sessions AS (
         SELECT door_opens_grouped.session_id,
            min(door_opens_grouped.id) AS door_id,
            min(door_opens_grouped.event_time) AS session_start,
            max(door_opens_grouped.event_time) AS session_end
           FROM door_opens_grouped
          GROUP BY door_opens_grouped.session_id
        ), unlock_events AS (
         SELECT gate_events.id,
            gate_events.event_time,
            gate_events.method,
            gate_events.raw_hex
           FROM gate_events
          WHERE gate_events.method::text = ANY (ARRAY['password'::character varying, 'fingerprint'::character varying, 'card'::character varying, 'remote'::character varying]::text[])
        ), sessions_with_unlock AS (
         SELECT s_1.door_id,
            s_1.session_start,
            s_1.session_end,
            u.id AS unlock_id,
            u.method AS unlock_method,
            u.raw_hex AS unlock_raw_hex
           FROM door_sessions s_1
             LEFT JOIN LATERAL ( SELECT ue.id,
                    ue.method,
                    ue.raw_hex,
                    ue.event_time
                   FROM unlock_events ue
                  WHERE ue.event_time >= (s_1.session_start - '00:00:05'::interval) AND ue.event_time <= (s_1.session_end + '00:00:30'::interval)
                  ORDER BY (abs(EXTRACT(epoch FROM ue.event_time - s_1.session_end)))
                 LIMIT 1) u ON true
        )
 SELECT (s.session_start AT TIME ZONE 'Asia/Ho_Chi_Minh'::text) AS event_time_vn,
        CASE
            WHEN s.unlock_id IS NOT NULL THEN 'incoming'::text
            ELSE 'outgoing'::text
        END AS direction,
    COALESCE(m.user_name, 'Unknown'::character varying) AS user_name,
    COALESCE(m.label, s.unlock_raw_hex) AS label,
    s.unlock_method AS method,
    s.unlock_raw_hex AS raw_hex,
    s.door_id,
    s.unlock_id
   FROM sessions_with_unlock s
     LEFT JOIN unlock_map m ON m.hex_key::text = s.unlock_raw_hex::text
  ORDER BY s.session_start DESC;;

CREATE OR REPLACE VIEW "public"."v_gate_clips_all" AS
SELECT session_id,
    unlock_id,
    (event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh'::text) AS event_time_local,
    direction,
    user_name,
    label,
    camera,
    frigate_event_id,
    frigate_label,
    frigate_score,
    delta_seconds,
    clip_finalized,
    codec,
    face_label,
    face_confidence,
    snapshot_url,
    clip_url,
    match_score,
    is_best_match
   FROM gate_session_clips
  ORDER BY event_time_vn DESC, match_score;;

CREATE OR REPLACE VIEW "public"."v_gate_clips_best" AS
SELECT session_id,
    unlock_id,
    (event_time_vn AT TIME ZONE 'Asia/Ho_Chi_Minh'::text) AS event_time_local,
    direction,
    user_name,
    label,
    method,
    camera,
    frigate_event_id,
    frigate_label,
    frigate_score,
    delta_seconds,
    event_start_time,
    event_end_time,
    clip_finalized,
    codec,
    face_label,
    face_confidence,
    snapshot_url,
    clip_url,
    match_score
   FROM gate_session_clips
  WHERE is_best_match = true
  ORDER BY event_time_vn DESC;;

CREATE OR REPLACE VIEW "public"."v_room_availability" AS
SELECT r.room_code,
    r.airbnb_listing_id,
    r.floor,
    bool_or(c.is_available) FILTER (WHERE c.calendar_date = CURRENT_DATE) AS today_available,
    bool_or(c.is_available) FILTER (WHERE c.calendar_date = (CURRENT_DATE + 1)) AS tomorrow_available,
    count(
        CASE
            WHEN c.calendar_date >= CURRENT_DATE AND c.calendar_date <= (CURRENT_DATE + 6) AND c.is_available = true THEN 1
            ELSE NULL::integer
        END) AS free_days_next_7,
    count(
        CASE
            WHEN c.calendar_date >= CURRENT_DATE AND c.calendar_date <= (CURRENT_DATE + 29) AND c.is_available = true THEN 1
            ELSE NULL::integer
        END) AS free_days_next_30,
    max(c.scraped_at) AS last_scraped_at
   FROM rooms r
     LEFT JOIN airbnb_calendar c ON c.room_id = r.id AND c.calendar_date >= (CURRENT_DATE - 1) AND c.calendar_date <= (CURRENT_DATE + 30)
  WHERE r.is_active = true
  GROUP BY r.id, r.room_code, r.airbnb_listing_id, r.floor
  ORDER BY r.floor, r."position";;

CREATE OR REPLACE VIEW "public"."v_should_scrape" AS
SELECT r.id AS room_id,
    r.room_code,
    r.airbnb_listing_id,
    r.airbnb_url,
    t.is_available AS today_available,
    tm.is_available AS tomorrow_available,
    COALESCE(t.is_available, true) OR COALESCE(tm.is_available, true) AS should_run,
        CASE
            WHEN NOT COALESCE(t.is_available, true) AND NOT COALESCE(tm.is_available, true) THEN 'room_busy_today_and_tomorrow'::text
            ELSE NULL::text
        END AS skip_reason
   FROM rooms r
     LEFT JOIN airbnb_calendar t ON t.room_id = r.id AND t.calendar_date = CURRENT_DATE
     LEFT JOIN airbnb_calendar tm ON tm.room_id = r.id AND tm.calendar_date = (CURRENT_DATE + 1)
  WHERE r.is_active = true AND r.airbnb_listing_id IS NOT NULL
  ORDER BY r.floor, r."position";;

-- ============================================================
--  VIEWS — schema: enroll
-- ============================================================

CREATE OR REPLACE VIEW "enroll"."v_occupancy" AS
SELECT rs.room_id,
    rs.person_id,
    pp.display_name,
    pp.known_room,
    pp.confidence_lvl,
    pp.face_quality,
    pp.gender,
    pp.age_estimate,
    pp.appearance_notes,
    rs.entry_ts,
    rs.entry_confidence,
    EXTRACT(epoch FROM now() - rs.entry_ts) / 3600::numeric AS hours_in_room
   FROM enroll.room_stays rs
     JOIN enroll.person_profiles pp ON pp.id = rs.person_id
  WHERE rs.exit_ts IS NULL
  ORDER BY rs.entry_ts DESC;;

CREATE OR REPLACE VIEW "enroll"."v_queue_stats" AS
SELECT status,
    count(*)::integer AS cnt,
    min(scheduled_at) AS oldest_scheduled,
    avg(EXTRACT(epoch FROM finished_at - started_at)) FILTER (WHERE finished_at IS NOT NULL) AS avg_duration_s
   FROM enroll.job_queue
  WHERE created_at >= (now() - '7 days'::interval)
  GROUP BY status;;

CREATE OR REPLACE VIEW "enroll"."v_sessions" AS
SELECT es.id,
    es.job_id,
    es.room_label,
    es.event_time_vn,
    es.status,
    es.direction,
    es.person_count,
    es.persons_enrolled,
    es.recognized_person_id,
    es.recognition_sim,
    es.overall_quality,
    es.best_face_score,
    es.stopped_at_cam,
    es.used_video,
    es.total_ms,
    es.error_msg,
    es.warnings,
    es.created_at,
    gs.user_name,
    gs.method,
    pp.display_name AS recognized_name,
    pp.known_room AS recognized_room,
    pp.gender AS recognized_gender,
    pp.face_source_cam AS recognized_face_cam,
    ( SELECT ccr2.frigate_event_id
           FROM enroll.person_session_map psm2
             JOIN enroll.camera_clip_results ccr2 ON ccr2.enroll_session_id = psm2.enroll_session_id
          WHERE psm2.person_id = pp.id AND ccr2.frigate_event_id IS NOT NULL
          ORDER BY ccr2.stopped_here DESC, ccr2.confidence DESC NULLS LAST
         LIMIT 1) AS recognized_face_event_id
   FROM enroll.enroll_sessions es
     LEFT JOIN gate_sessions gs ON gs.door_id::text = es.door_id AND gs.unlock_id::text = es.unlock_id
     LEFT JOIN enroll.person_profiles pp ON pp.id = es.recognized_person_id;;

-- ============================================================
--  INDEXES
-- ============================================================

-- enroll.camera_clip_results
CREATE INDEX idx_ccr_session ON enroll.camera_clip_results USING btree (enroll_session_id, camera_order);

-- enroll.enroll_sessions
CREATE INDEX idx_es_room_time ON enroll.enroll_sessions USING btree (room_label, event_time_vn DESC);

-- enroll.enroll_sessions
CREATE INDEX idx_es_status ON enroll.enroll_sessions USING btree (status, created_at DESC);

-- enroll.job_queue
CREATE INDEX idx_jq_poll ON enroll.job_queue USING btree (status, scheduled_at) WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]));

-- enroll.person_profiles
CREATE INDEX idx_pp_face_ivf ON enroll.person_profiles USING ivfflat (face_embedding vector_cosine_ops) WITH (lists='100');

-- enroll.person_profiles
CREATE INDEX idx_pp_room ON enroll.person_profiles USING btree (known_room, last_seen_ts DESC) WHERE ((known_room IS NOT NULL) AND is_active);

-- enroll.room_stays
CREATE INDEX idx_rs_open ON enroll.room_stays USING btree (room_id, entry_ts DESC) WHERE (exit_ts IS NULL);

-- public.airbnb_calendar
CREATE INDEX idx_cal_available ON public.airbnb_calendar USING btree (calendar_date, is_available) WHERE (is_available = true);

-- public.airbnb_calendar
CREATE INDEX idx_cal_date ON public.airbnb_calendar USING btree (calendar_date);

-- public.airbnb_calendar
CREATE INDEX idx_cal_room_date ON public.airbnb_calendar USING btree (room_id, calendar_date DESC);

-- public.gate_events
CREATE INDEX idx_gate_events_device ON public.gate_events USING btree (device_name);

-- public.gate_events
CREATE INDEX idx_gate_events_event_time ON public.gate_events USING btree (event_time DESC);

-- public.gate_events
CREATE INDEX idx_gate_events_method ON public.gate_events USING btree (method);

-- public.gate_events
CREATE INDEX idx_gate_events_raw_hex ON public.gate_events USING btree (raw_hex);

-- public.gate_session_clips
CREATE INDEX idx_gsc_best ON public.gate_session_clips USING btree (is_best_match) WHERE (is_best_match = true);

-- public.gate_session_clips
CREATE INDEX idx_gsc_direction ON public.gate_session_clips USING btree (direction);

-- public.gate_session_clips
CREATE INDEX idx_gsc_event_time ON public.gate_session_clips USING btree (event_time_vn DESC);

-- public.gate_session_clips
CREATE INDEX idx_gsc_face ON public.gate_session_clips USING btree (face_label) WHERE (face_label IS NOT NULL);

-- public.gate_session_clips
CREATE INDEX idx_gsc_finalized ON public.gate_session_clips USING btree (clip_finalized);

-- public.gate_session_clips
CREATE UNIQUE INDEX idx_gsc_manual_one_per_session ON public.gate_session_clips USING btree (session_id, event_time_vn, direction) WHERE (manual_best_match = true);

-- public.gate_session_clips
CREATE INDEX idx_gsc_session_id ON public.gate_session_clips USING btree (session_id);

-- public.gate_session_clips
CREATE INDEX idx_gsc_time_dir ON public.gate_session_clips USING btree (event_time_vn, direction);

-- public.scrape_runs
CREATE INDEX idx_sr_room ON public.scrape_runs USING btree (room_id, started_at DESC);

-- public.scrape_runs
CREATE INDEX idx_sr_started ON public.scrape_runs USING btree (started_at DESC);

-- public.scrape_runs
CREATE INDEX idx_sr_status ON public.scrape_runs USING btree (status);

-- public.video_clips
CREATE INDEX idx_vc_dispatch ON public.video_clips USING btree (status, clip_end, retry_after) WHERE (status = 'pending'::video_status);

-- public.video_clips
CREATE INDEX idx_vc_request ON public.video_clips USING btree (request_id, status);

-- public.video_extraction_requests
CREATE INDEX idx_ver_session ON public.video_extraction_requests USING btree (session_id);

-- public.video_worker_logs
CREATE INDEX idx_wl_clip ON public.video_worker_logs USING btree (clip_id, created_at DESC);

-- ============================================================
--  TRIGGERS
-- ============================================================

CREATE TRIGGER "set_updated_at_devices"
    BEFORE UPDATE
    ON "public"."devices"
    FOR EACH ROW
    EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER "set_updated_at"
    BEFORE UPDATE
    ON "public"."gate_session_clips"
    FOR EACH ROW
    EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER "trg_unlock_map_updated"
    BEFORE UPDATE
    ON "public"."unlock_map"
    FOR EACH ROW
    EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER "trg_vc_updated_at"
    BEFORE UPDATE
    ON "public"."video_clips"
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER "trg_ver_updated_at"
    BEFORE UPDATE
    ON "public"."video_extraction_requests"
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ============================================================
--  FUNCTIONS / PROCEDURES
-- ============================================================

-- enroll.claim_job(p_worker text)
CREATE OR REPLACE FUNCTION enroll.claim_job(p_worker text)
 RETURNS SETOF enroll.job_queue
 LANGUAGE sql
AS $function$
    UPDATE enroll.job_queue SET
        status        = 'running',
        locked_by     = p_worker,
        locked_at     = now(),
        started_at    = now(),
        attempt_count = attempt_count + 1
    WHERE id = (
        SELECT id FROM enroll.job_queue
        WHERE  status       = 'pending'
        AND    scheduled_at <= now()
        AND    attempt_count < max_attempts
        ORDER BY priority ASC, scheduled_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
$function$;

-- enroll.close_room_stay(p_person_id uuid, p_exit_ts timestamp with time zone, p_exit_door_id text DEFAULT NULL::text, p_exit_unlock_id text DEFAULT NULL::text, p_exit_conf text DEFAULT 'camera_chain'::text)
CREATE OR REPLACE FUNCTION enroll.close_room_stay(p_person_id uuid, p_exit_ts timestamp with time zone, p_exit_door_id text DEFAULT NULL::text, p_exit_unlock_id text DEFAULT NULL::text, p_exit_conf text DEFAULT 'camera_chain'::text)
 RETURNS integer
 LANGUAGE sql
AS $function$
    WITH r AS (
        UPDATE enroll.room_stays SET
            exit_ts          = p_exit_ts,
            exit_door_id     = p_exit_door_id,
            exit_unlock_id   = p_exit_unlock_id,
            exit_confidence  = p_exit_conf
        WHERE person_id = p_person_id
          AND exit_ts IS NULL
        RETURNING id
    ) SELECT COUNT(*)::INT FROM r;
$function$;

-- enroll.release_stuck(p_timeout_min integer DEFAULT 30)
CREATE OR REPLACE FUNCTION enroll.release_stuck(p_timeout_min integer DEFAULT 30)
 RETURNS integer
 LANGUAGE sql
AS $function$
    WITH r AS (
        UPDATE enroll.job_queue SET
            status       = 'pending',
            locked_by    = NULL,
            locked_at    = NULL,
            started_at   = NULL,
            scheduled_at = now() + interval '5 minutes'
        WHERE status    = 'running'
        AND   locked_at < now() - (p_timeout_min * interval '1 minute')
        RETURNING id
    ) SELECT COUNT(*)::INT FROM r;
$function$;

-- public.array_to_halfvec(double precision[], integer, boolean)
CREATE OR REPLACE FUNCTION public.array_to_halfvec(double precision[], integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_halfvec$function$;

-- public.array_to_halfvec(integer[], integer, boolean)
CREATE OR REPLACE FUNCTION public.array_to_halfvec(integer[], integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_halfvec$function$;

-- public.array_to_halfvec(real[], integer, boolean)
CREATE OR REPLACE FUNCTION public.array_to_halfvec(real[], integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_halfvec$function$;

-- public.array_to_halfvec(numeric[], integer, boolean)
CREATE OR REPLACE FUNCTION public.array_to_halfvec(numeric[], integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_halfvec$function$;

-- public.array_to_sparsevec(double precision[], integer, boolean)
CREATE OR REPLACE FUNCTION public.array_to_sparsevec(double precision[], integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_sparsevec$function$;

-- public.array_to_sparsevec(numeric[], integer, boolean)
CREATE OR REPLACE FUNCTION public.array_to_sparsevec(numeric[], integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_sparsevec$function$;

-- public.array_to_sparsevec(integer[], integer, boolean)
CREATE OR REPLACE FUNCTION public.array_to_sparsevec(integer[], integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_sparsevec$function$;

-- public.array_to_sparsevec(real[], integer, boolean)
CREATE OR REPLACE FUNCTION public.array_to_sparsevec(real[], integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_sparsevec$function$;

-- public.array_to_vector(double precision[], integer, boolean)
CREATE OR REPLACE FUNCTION public.array_to_vector(double precision[], integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_vector$function$;

-- public.array_to_vector(numeric[], integer, boolean)
CREATE OR REPLACE FUNCTION public.array_to_vector(numeric[], integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_vector$function$;

-- public.array_to_vector(integer[], integer, boolean)
CREATE OR REPLACE FUNCTION public.array_to_vector(integer[], integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_vector$function$;

-- public.array_to_vector(real[], integer, boolean)
CREATE OR REPLACE FUNCTION public.array_to_vector(real[], integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$array_to_vector$function$;

-- public.binary_quantize(halfvec)
CREATE OR REPLACE FUNCTION public.binary_quantize(halfvec)
 RETURNS bit
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_binary_quantize$function$;

-- public.binary_quantize(vector)
CREATE OR REPLACE FUNCTION public.binary_quantize(vector)
 RETURNS bit
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$binary_quantize$function$;

-- public.cosine_distance(sparsevec, sparsevec)
CREATE OR REPLACE FUNCTION public.cosine_distance(sparsevec, sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_cosine_distance$function$;

-- public.cosine_distance(vector, vector)
CREATE OR REPLACE FUNCTION public.cosine_distance(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$cosine_distance$function$;

-- public.cosine_distance(halfvec, halfvec)
CREATE OR REPLACE FUNCTION public.cosine_distance(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_cosine_distance$function$;

-- public.halfvec(halfvec, integer, boolean)
CREATE OR REPLACE FUNCTION public.halfvec(halfvec, integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec$function$;

-- public.halfvec_accum(double precision[], halfvec)
CREATE OR REPLACE FUNCTION public.halfvec_accum(double precision[], halfvec)
 RETURNS double precision[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_accum$function$;

-- public.halfvec_add(halfvec, halfvec)
CREATE OR REPLACE FUNCTION public.halfvec_add(halfvec, halfvec)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_add$function$;

-- public.halfvec_avg(double precision[])
CREATE OR REPLACE FUNCTION public.halfvec_avg(double precision[])
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_avg$function$;

-- public.halfvec_cmp(halfvec, halfvec)
CREATE OR REPLACE FUNCTION public.halfvec_cmp(halfvec, halfvec)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_cmp$function$;

-- public.halfvec_combine(double precision[], double precision[])
CREATE OR REPLACE FUNCTION public.halfvec_combine(double precision[], double precision[])
 RETURNS double precision[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_combine$function$;

-- public.halfvec_concat(halfvec, halfvec)
CREATE OR REPLACE FUNCTION public.halfvec_concat(halfvec, halfvec)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_concat$function$;

-- public.halfvec_eq(halfvec, halfvec)
CREATE OR REPLACE FUNCTION public.halfvec_eq(halfvec, halfvec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_eq$function$;

-- public.halfvec_ge(halfvec, halfvec)
CREATE OR REPLACE FUNCTION public.halfvec_ge(halfvec, halfvec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_ge$function$;

-- public.halfvec_gt(halfvec, halfvec)
CREATE OR REPLACE FUNCTION public.halfvec_gt(halfvec, halfvec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_gt$function$;

-- public.halfvec_in(cstring, oid, integer)
CREATE OR REPLACE FUNCTION public.halfvec_in(cstring, oid, integer)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_in$function$;

-- public.halfvec_l2_squared_distance(halfvec, halfvec)
CREATE OR REPLACE FUNCTION public.halfvec_l2_squared_distance(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l2_squared_distance$function$;

-- public.halfvec_le(halfvec, halfvec)
CREATE OR REPLACE FUNCTION public.halfvec_le(halfvec, halfvec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_le$function$;

-- public.halfvec_lt(halfvec, halfvec)
CREATE OR REPLACE FUNCTION public.halfvec_lt(halfvec, halfvec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_lt$function$;

-- public.halfvec_mul(halfvec, halfvec)
CREATE OR REPLACE FUNCTION public.halfvec_mul(halfvec, halfvec)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_mul$function$;

-- public.halfvec_ne(halfvec, halfvec)
CREATE OR REPLACE FUNCTION public.halfvec_ne(halfvec, halfvec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_ne$function$;

-- public.halfvec_negative_inner_product(halfvec, halfvec)
CREATE OR REPLACE FUNCTION public.halfvec_negative_inner_product(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_negative_inner_product$function$;

-- public.halfvec_out(halfvec)
CREATE OR REPLACE FUNCTION public.halfvec_out(halfvec)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_out$function$;

-- public.halfvec_recv(internal, oid, integer)
CREATE OR REPLACE FUNCTION public.halfvec_recv(internal, oid, integer)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_recv$function$;

-- public.halfvec_send(halfvec)
CREATE OR REPLACE FUNCTION public.halfvec_send(halfvec)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_send$function$;

-- public.halfvec_spherical_distance(halfvec, halfvec)
CREATE OR REPLACE FUNCTION public.halfvec_spherical_distance(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_spherical_distance$function$;

-- public.halfvec_sub(halfvec, halfvec)
CREATE OR REPLACE FUNCTION public.halfvec_sub(halfvec, halfvec)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_sub$function$;

-- public.halfvec_to_float4(halfvec, integer, boolean)
CREATE OR REPLACE FUNCTION public.halfvec_to_float4(halfvec, integer, boolean)
 RETURNS real[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_to_float4$function$;

-- public.halfvec_to_sparsevec(halfvec, integer, boolean)
CREATE OR REPLACE FUNCTION public.halfvec_to_sparsevec(halfvec, integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_to_sparsevec$function$;

-- public.halfvec_to_vector(halfvec, integer, boolean)
CREATE OR REPLACE FUNCTION public.halfvec_to_vector(halfvec, integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_to_vector$function$;

-- public.halfvec_typmod_in(cstring[])
CREATE OR REPLACE FUNCTION public.halfvec_typmod_in(cstring[])
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_typmod_in$function$;

-- public.hamming_distance(bit, bit)
CREATE OR REPLACE FUNCTION public.hamming_distance(bit, bit)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$hamming_distance$function$;

-- public.hnsw_bit_support(internal)
CREATE OR REPLACE FUNCTION public.hnsw_bit_support(internal)
 RETURNS internal
 LANGUAGE c
AS '$libdir/vector', $function$hnsw_bit_support$function$;

-- public.hnsw_halfvec_support(internal)
CREATE OR REPLACE FUNCTION public.hnsw_halfvec_support(internal)
 RETURNS internal
 LANGUAGE c
AS '$libdir/vector', $function$hnsw_halfvec_support$function$;

-- public.hnsw_sparsevec_support(internal)
CREATE OR REPLACE FUNCTION public.hnsw_sparsevec_support(internal)
 RETURNS internal
 LANGUAGE c
AS '$libdir/vector', $function$hnsw_sparsevec_support$function$;

-- public.hnswhandler(internal)
CREATE OR REPLACE FUNCTION public.hnswhandler(internal)
 RETURNS index_am_handler
 LANGUAGE c
AS '$libdir/vector', $function$hnswhandler$function$;

-- public.inner_product(vector, vector)
CREATE OR REPLACE FUNCTION public.inner_product(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$inner_product$function$;

-- public.inner_product(halfvec, halfvec)
CREATE OR REPLACE FUNCTION public.inner_product(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_inner_product$function$;

-- public.inner_product(sparsevec, sparsevec)
CREATE OR REPLACE FUNCTION public.inner_product(sparsevec, sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_inner_product$function$;

-- public.ivfflat_bit_support(internal)
CREATE OR REPLACE FUNCTION public.ivfflat_bit_support(internal)
 RETURNS internal
 LANGUAGE c
AS '$libdir/vector', $function$ivfflat_bit_support$function$;

-- public.ivfflat_halfvec_support(internal)
CREATE OR REPLACE FUNCTION public.ivfflat_halfvec_support(internal)
 RETURNS internal
 LANGUAGE c
AS '$libdir/vector', $function$ivfflat_halfvec_support$function$;

-- public.ivfflathandler(internal)
CREATE OR REPLACE FUNCTION public.ivfflathandler(internal)
 RETURNS index_am_handler
 LANGUAGE c
AS '$libdir/vector', $function$ivfflathandler$function$;

-- public.jaccard_distance(bit, bit)
CREATE OR REPLACE FUNCTION public.jaccard_distance(bit, bit)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$jaccard_distance$function$;

-- public.l1_distance(halfvec, halfvec)
CREATE OR REPLACE FUNCTION public.l1_distance(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l1_distance$function$;

-- public.l1_distance(sparsevec, sparsevec)
CREATE OR REPLACE FUNCTION public.l1_distance(sparsevec, sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l1_distance$function$;

-- public.l1_distance(vector, vector)
CREATE OR REPLACE FUNCTION public.l1_distance(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$l1_distance$function$;

-- public.l2_distance(vector, vector)
CREATE OR REPLACE FUNCTION public.l2_distance(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$l2_distance$function$;

-- public.l2_distance(halfvec, halfvec)
CREATE OR REPLACE FUNCTION public.l2_distance(halfvec, halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l2_distance$function$;

-- public.l2_distance(sparsevec, sparsevec)
CREATE OR REPLACE FUNCTION public.l2_distance(sparsevec, sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l2_distance$function$;

-- public.l2_norm(sparsevec)
CREATE OR REPLACE FUNCTION public.l2_norm(sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l2_norm$function$;

-- public.l2_norm(halfvec)
CREATE OR REPLACE FUNCTION public.l2_norm(halfvec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l2_norm$function$;

-- public.l2_normalize(sparsevec)
CREATE OR REPLACE FUNCTION public.l2_normalize(sparsevec)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l2_normalize$function$;

-- public.l2_normalize(vector)
CREATE OR REPLACE FUNCTION public.l2_normalize(vector)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$l2_normalize$function$;

-- public.l2_normalize(halfvec)
CREATE OR REPLACE FUNCTION public.l2_normalize(halfvec)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_l2_normalize$function$;

-- public.set_updated_at()
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$;

-- public.sparsevec(sparsevec, integer, boolean)
CREATE OR REPLACE FUNCTION public.sparsevec(sparsevec, integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec$function$;

-- public.sparsevec_cmp(sparsevec, sparsevec)
CREATE OR REPLACE FUNCTION public.sparsevec_cmp(sparsevec, sparsevec)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_cmp$function$;

-- public.sparsevec_eq(sparsevec, sparsevec)
CREATE OR REPLACE FUNCTION public.sparsevec_eq(sparsevec, sparsevec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_eq$function$;

-- public.sparsevec_ge(sparsevec, sparsevec)
CREATE OR REPLACE FUNCTION public.sparsevec_ge(sparsevec, sparsevec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_ge$function$;

-- public.sparsevec_gt(sparsevec, sparsevec)
CREATE OR REPLACE FUNCTION public.sparsevec_gt(sparsevec, sparsevec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_gt$function$;

-- public.sparsevec_in(cstring, oid, integer)
CREATE OR REPLACE FUNCTION public.sparsevec_in(cstring, oid, integer)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_in$function$;

-- public.sparsevec_l2_squared_distance(sparsevec, sparsevec)
CREATE OR REPLACE FUNCTION public.sparsevec_l2_squared_distance(sparsevec, sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_l2_squared_distance$function$;

-- public.sparsevec_le(sparsevec, sparsevec)
CREATE OR REPLACE FUNCTION public.sparsevec_le(sparsevec, sparsevec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_le$function$;

-- public.sparsevec_lt(sparsevec, sparsevec)
CREATE OR REPLACE FUNCTION public.sparsevec_lt(sparsevec, sparsevec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_lt$function$;

-- public.sparsevec_ne(sparsevec, sparsevec)
CREATE OR REPLACE FUNCTION public.sparsevec_ne(sparsevec, sparsevec)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_ne$function$;

-- public.sparsevec_negative_inner_product(sparsevec, sparsevec)
CREATE OR REPLACE FUNCTION public.sparsevec_negative_inner_product(sparsevec, sparsevec)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_negative_inner_product$function$;

-- public.sparsevec_out(sparsevec)
CREATE OR REPLACE FUNCTION public.sparsevec_out(sparsevec)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_out$function$;

-- public.sparsevec_recv(internal, oid, integer)
CREATE OR REPLACE FUNCTION public.sparsevec_recv(internal, oid, integer)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_recv$function$;

-- public.sparsevec_send(sparsevec)
CREATE OR REPLACE FUNCTION public.sparsevec_send(sparsevec)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_send$function$;

-- public.sparsevec_to_halfvec(sparsevec, integer, boolean)
CREATE OR REPLACE FUNCTION public.sparsevec_to_halfvec(sparsevec, integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_to_halfvec$function$;

-- public.sparsevec_to_vector(sparsevec, integer, boolean)
CREATE OR REPLACE FUNCTION public.sparsevec_to_vector(sparsevec, integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_to_vector$function$;

-- public.sparsevec_typmod_in(cstring[])
CREATE OR REPLACE FUNCTION public.sparsevec_typmod_in(cstring[])
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$sparsevec_typmod_in$function$;

-- public.subvector(vector, integer, integer)
CREATE OR REPLACE FUNCTION public.subvector(vector, integer, integer)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$subvector$function$;

-- public.subvector(halfvec, integer, integer)
CREATE OR REPLACE FUNCTION public.subvector(halfvec, integer, integer)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_subvector$function$;

-- public.touch_updated_at()
CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$function$;

-- public.trg_set_updated_at()
CREATE OR REPLACE FUNCTION public.trg_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$function$;

-- public.uuid_generate_v1()
CREATE OR REPLACE FUNCTION public.uuid_generate_v1()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v1$function$;

-- public.uuid_generate_v1mc()
CREATE OR REPLACE FUNCTION public.uuid_generate_v1mc()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v1mc$function$;

-- public.uuid_generate_v3(namespace uuid, name text)
CREATE OR REPLACE FUNCTION public.uuid_generate_v3(namespace uuid, name text)
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v3$function$;

-- public.uuid_generate_v4()
CREATE OR REPLACE FUNCTION public.uuid_generate_v4()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v4$function$;

-- public.uuid_generate_v5(namespace uuid, name text)
CREATE OR REPLACE FUNCTION public.uuid_generate_v5(namespace uuid, name text)
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v5$function$;

-- public.uuid_nil()
CREATE OR REPLACE FUNCTION public.uuid_nil()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_nil$function$;

-- public.uuid_ns_dns()
CREATE OR REPLACE FUNCTION public.uuid_ns_dns()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_dns$function$;

-- public.uuid_ns_oid()
CREATE OR REPLACE FUNCTION public.uuid_ns_oid()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_oid$function$;

-- public.uuid_ns_url()
CREATE OR REPLACE FUNCTION public.uuid_ns_url()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_url$function$;

-- public.uuid_ns_x500()
CREATE OR REPLACE FUNCTION public.uuid_ns_x500()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_x500$function$;

-- public.vector(vector, integer, boolean)
CREATE OR REPLACE FUNCTION public.vector(vector, integer, boolean)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector$function$;

-- public.vector_accum(double precision[], vector)
CREATE OR REPLACE FUNCTION public.vector_accum(double precision[], vector)
 RETURNS double precision[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_accum$function$;

-- public.vector_add(vector, vector)
CREATE OR REPLACE FUNCTION public.vector_add(vector, vector)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_add$function$;

-- public.vector_avg(double precision[])
CREATE OR REPLACE FUNCTION public.vector_avg(double precision[])
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_avg$function$;

-- public.vector_cmp(vector, vector)
CREATE OR REPLACE FUNCTION public.vector_cmp(vector, vector)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_cmp$function$;

-- public.vector_combine(double precision[], double precision[])
CREATE OR REPLACE FUNCTION public.vector_combine(double precision[], double precision[])
 RETURNS double precision[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_combine$function$;

-- public.vector_concat(vector, vector)
CREATE OR REPLACE FUNCTION public.vector_concat(vector, vector)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_concat$function$;

-- public.vector_dims(halfvec)
CREATE OR REPLACE FUNCTION public.vector_dims(halfvec)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$halfvec_vector_dims$function$;

-- public.vector_dims(vector)
CREATE OR REPLACE FUNCTION public.vector_dims(vector)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_dims$function$;

-- public.vector_eq(vector, vector)
CREATE OR REPLACE FUNCTION public.vector_eq(vector, vector)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_eq$function$;

-- public.vector_ge(vector, vector)
CREATE OR REPLACE FUNCTION public.vector_ge(vector, vector)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_ge$function$;

-- public.vector_gt(vector, vector)
CREATE OR REPLACE FUNCTION public.vector_gt(vector, vector)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_gt$function$;

-- public.vector_in(cstring, oid, integer)
CREATE OR REPLACE FUNCTION public.vector_in(cstring, oid, integer)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_in$function$;

-- public.vector_l2_squared_distance(vector, vector)
CREATE OR REPLACE FUNCTION public.vector_l2_squared_distance(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_l2_squared_distance$function$;

-- public.vector_le(vector, vector)
CREATE OR REPLACE FUNCTION public.vector_le(vector, vector)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_le$function$;

-- public.vector_lt(vector, vector)
CREATE OR REPLACE FUNCTION public.vector_lt(vector, vector)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_lt$function$;

-- public.vector_mul(vector, vector)
CREATE OR REPLACE FUNCTION public.vector_mul(vector, vector)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_mul$function$;

-- public.vector_ne(vector, vector)
CREATE OR REPLACE FUNCTION public.vector_ne(vector, vector)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_ne$function$;

-- public.vector_negative_inner_product(vector, vector)
CREATE OR REPLACE FUNCTION public.vector_negative_inner_product(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_negative_inner_product$function$;

-- public.vector_norm(vector)
CREATE OR REPLACE FUNCTION public.vector_norm(vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_norm$function$;

-- public.vector_out(vector)
CREATE OR REPLACE FUNCTION public.vector_out(vector)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_out$function$;

-- public.vector_recv(internal, oid, integer)
CREATE OR REPLACE FUNCTION public.vector_recv(internal, oid, integer)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_recv$function$;

-- public.vector_send(vector)
CREATE OR REPLACE FUNCTION public.vector_send(vector)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_send$function$;

-- public.vector_spherical_distance(vector, vector)
CREATE OR REPLACE FUNCTION public.vector_spherical_distance(vector, vector)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_spherical_distance$function$;

-- public.vector_sub(vector, vector)
CREATE OR REPLACE FUNCTION public.vector_sub(vector, vector)
 RETURNS vector
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_sub$function$;

-- public.vector_to_float4(vector, integer, boolean)
CREATE OR REPLACE FUNCTION public.vector_to_float4(vector, integer, boolean)
 RETURNS real[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_to_float4$function$;

-- public.vector_to_halfvec(vector, integer, boolean)
CREATE OR REPLACE FUNCTION public.vector_to_halfvec(vector, integer, boolean)
 RETURNS halfvec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_to_halfvec$function$;

-- public.vector_to_sparsevec(vector, integer, boolean)
CREATE OR REPLACE FUNCTION public.vector_to_sparsevec(vector, integer, boolean)
 RETURNS sparsevec
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_to_sparsevec$function$;

-- public.vector_typmod_in(cstring[])
CREATE OR REPLACE FUNCTION public.vector_typmod_in(cstring[])
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/vector', $function$vector_typmod_in$function$;

-- End of dump — 2026-07-01 07:37:29
