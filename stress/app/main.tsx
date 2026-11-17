import React from "react";
import ReactDOM from "react-dom/client";

import "./styles.css";
import { StressTestApp } from "./StressTestApp";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StressTestApp />
  </React.StrictMode>
);
