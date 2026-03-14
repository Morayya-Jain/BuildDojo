-- Expand canonical skill levels to include: beginner, intermediate, advanced, master

BEGIN;

UPDATE projects
SET skill_level = CASE
  WHEN lower(skill_level) IN ('exploring', 'student') THEN 'intermediate'
  WHEN lower(skill_level) = 'beginner' THEN 'beginner'
  WHEN lower(skill_level) = 'intermediate' THEN 'intermediate'
  WHEN lower(skill_level) = 'advanced' THEN 'advanced'
  WHEN lower(skill_level) = 'master' THEN 'master'
  ELSE 'intermediate'
END
WHERE
  skill_level IS NULL
  OR skill_level IS DISTINCT FROM lower(skill_level)
  OR lower(skill_level) NOT IN ('beginner', 'intermediate', 'advanced', 'master');

UPDATE profiles
SET expertise_level = CASE
  WHEN lower(expertise_level) IN ('exploring', 'student') THEN 'intermediate'
  WHEN lower(expertise_level) = 'beginner' THEN 'beginner'
  WHEN lower(expertise_level) = 'intermediate' THEN 'intermediate'
  WHEN lower(expertise_level) = 'advanced' THEN 'advanced'
  WHEN lower(expertise_level) = 'master' THEN 'master'
  ELSE NULL
END
WHERE
  expertise_level IS NOT NULL
  AND (
    expertise_level IS DISTINCT FROM lower(expertise_level)
    OR lower(expertise_level) NOT IN ('beginner', 'intermediate', 'advanced', 'master')
  );

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_skill_level_check;
ALTER TABLE projects
  ADD CONSTRAINT projects_skill_level_check
  CHECK (skill_level IN ('beginner', 'intermediate', 'advanced', 'master'));

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_expertise_level_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_expertise_level_check
  CHECK (
    expertise_level IS NULL
    OR expertise_level IN ('beginner', 'intermediate', 'advanced', 'master')
  );

COMMIT;
