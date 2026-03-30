-- 批量生成激活码脚本
-- 修改 generate_series 范围来控制数量

INSERT INTO activation_codes (code)
SELECT
  'ICF-' || substring(md5(random()::text), 1, 6)
FROM generate_series(1, 50)
ON CONFLICT (code) DO NOTHING;

-- 查看所有未使用激活码
SELECT code, created_at FROM activation_codes WHERE is_used = FALSE ORDER BY created_at;
