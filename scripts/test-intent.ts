import { matchUserIntent } from '../src/shared/intentRules.ts'

const pos = ['请跳舞', '摇晃一下', '拍一下', '思考一下']
for (const t of pos) {
  const i = matchUserIntent(t)
  if (!i.matched) {
    console.error('pos fail', t, i)
    process.exit(1)
  }
}

const neg = ['我不要这个', '拍桌子太响了', '我很同意', '不要这样']
for (const t of neg) {
  const i = matchUserIntent(t)
  if (i.matched) {
    console.error('neg fail', t, i)
    process.exit(1)
  }
}

console.log('intent ok')
