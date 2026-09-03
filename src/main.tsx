
  import { createRoot } from "react-dom/client";
import { createElement } from "react";
// import the compiled JS output to avoid TypeScript resolving the .tsx source
import App from "./app/App.js";
// @ts-ignore: side-effect CSS import
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(createElement(App));
  