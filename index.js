import "./src/services/sentry";

import * as Sentry from "@sentry/react-native";
import { registerRootComponent } from "expo";

import App from "./App";

registerRootComponent(Sentry.wrap(App));
