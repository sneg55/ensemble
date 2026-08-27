export const ErrorIds = {
  CFG_KEY_MISSING: "E_CFG_001",
  CFG_PHOTO_MISSING: "E_CFG_002",
  CAT_FETCH_FAIL: "E_CAT_001",
  CAT_EMPTY: "E_CAT_002",
  CAT_NO_STORE_TAB: "E_CAT_003",
  CART_ADD_FAIL: "E_CART_001",
  CART_EMPTY_LOOK: "E_CART_002",
  RENDER_NO_IMAGE: "E_RND_001",
  RENDER_HTTP: "E_RND_002",
  SUGGEST_HTTP: "E_SUG_001",
  MSG_NO_RESPONSE: "E_MSG_001"
};

export class AppError extends Error {
  constructor(id, message, context = {}) {
    super(`${id}: ${message}`);
    this.id = id;
    this.context = context;
  }
}
