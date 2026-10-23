import schema from "./component/schema.js";

export const modules = import.meta.glob("./component/**/*.ts");
export { schema };
export default { schema, modules };
