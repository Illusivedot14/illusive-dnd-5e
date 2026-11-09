export const MODULE_ID = "illusive-dnd-5e";
export const MODULE_PATH = `modules/${MODULE_ID}`;

export async function illusiveDndLoadTemplates(paths) {
  return foundry.applications.handlebars.loadTemplates(paths);
}

export async function illusiveDndRenderTemplate(path, data) {
  return foundry.applications.handlebars.renderTemplate(path, data);
}
