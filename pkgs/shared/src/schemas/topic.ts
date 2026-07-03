import * as v from 'valibot';

export const createTopicSchema = v.object({
  name: v.pipe(
    v.string(),
    v.minLength(1, '主题名称不能为空'),
    v.regex(/^[a-zA-Z0-9_-]+$/, '只能包含字母、数字、下划线和中划线'),
  ),
});
