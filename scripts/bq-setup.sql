-- BigQuery JP限定派生テーブル作成スクリプト（手動実行専用・アプリからは実行しない）
--
-- patents-public-data.patents.publications への直接キーワード検索は
-- 無料枠（1TB/月）を即座に超えるため使用しない。ここで自プロジェクトに
-- JP限定・月パーティション・publication_numberクラスタの派生テーブルを
-- 一度だけ作成し、アプリはこの派生テーブルのみを検索する。
--
-- 実行前に必ず `bq query --use_legacy_sql=false --dry_run` でスキャン量を
-- 見積もること。1TBを超える場合は、claims_ja を含む列だけを別テーブルに
-- 分けるか、publication_date の範囲を年ごとに区切って複数回に分けて
-- 作成すること（一度に全期間をスキャンしない）。
--
-- ${PROJECT} は実行時に自分のGCPプロジェクトIDへ置換すること。

CREATE SCHEMA IF NOT EXISTS `${PROJECT}.patents_jp` OPTIONS (location = 'US');

CREATE OR REPLACE TABLE `${PROJECT}.patents_jp.publications`
PARTITION BY DATE_TRUNC(publication_date, MONTH)
CLUSTER BY publication_number
AS
SELECT
  publication_number,
  application_number,
  country_code,
  kind_code,
  SAFE.PARSE_DATE('%Y%m%d', CAST(publication_date AS STRING)) AS publication_date,
  SAFE.PARSE_DATE('%Y%m%d', CAST(filing_date AS STRING))      AS filing_date,
  (SELECT text FROM UNNEST(title_localized)    WHERE language = 'ja' LIMIT 1) AS title_ja,
  (SELECT text FROM UNNEST(abstract_localized) WHERE language = 'ja' LIMIT 1) AS abstract_ja,
  (SELECT text FROM UNNEST(claims_localized)   WHERE language = 'ja' LIMIT 1) AS claims_ja,
  ARRAY(SELECT name FROM UNNEST(assignee_harmonized)) AS assignees,
  ARRAY(SELECT code FROM UNNEST(ipc)) AS ipc_codes,
  ARRAY(SELECT code FROM UNNEST(cpc)) AS cpc_codes,
  ARRAY(SELECT c.publication_number FROM UNNEST(citation) c
        WHERE c.publication_number != '') AS cited_publications
FROM `patents-public-data.patents.publications`
WHERE country_code = 'JP'
  AND publication_date >= 20000101
