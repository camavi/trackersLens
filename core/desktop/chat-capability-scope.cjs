const crypto = require('node:crypto');
const fingerprint = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
class ReviewedChatCapability {
  constructor() { this.previews = new Map(); }
  scope(args, lifecycle) {
    if (!Number.isInteger(lifecycle?.ownerId) || !args.chatId || typeof args.chatId !== 'string' || !args.workspaceId || typeof args.workspaceId !== 'string') throw new Error('Trusted desktop owner/chat/workspace scope is required.');
    return { ownerId: lifecycle.ownerId, chatId: args.chatId, workspaceId: args.workspaceId };
  }
  sameScope(left, right) { return ['ownerId', 'chatId', 'workspaceId'].every(key => left[key] === right[key]); }
  preview(args, lifecycle, detail) {
    const scope = this.scope(args, lifecycle); const previewToken = crypto.randomUUID();
    this.previews.set(previewToken, { scope, args: JSON.parse(JSON.stringify(args)), detail });
    return { ...detail, previewToken };
  }
  consume(args, lifecycle) {
    const plan = this.previews.get(args.previewToken); this.previews.delete(args.previewToken);
    const { confirmed, previewToken, ...request } = args;
    if (!plan || confirmed !== true || !this.sameScope(plan.scope, this.scope(args, lifecycle)) || fingerprint(plan.args) !== fingerprint(request)) throw new Error('Confirmation is missing, changed or already consumed.');
    return plan;
  }
  forgetOwner(ownerId) { for (const [id, plan] of this.previews) if (plan.scope.ownerId === ownerId) this.previews.delete(id); }
}
module.exports = { ReviewedChatCapability, fingerprint };
