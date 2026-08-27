import { createApp } from "vue";
import { createPinia } from "pinia";
import AntDesign from "ant-design-vue";
import "ant-design-vue/dist/reset.css";
import App from "./App.vue";
import router from "@/router";
import "@/styles/index.css";

const app = createApp(App);

app.use(createPinia()).use(router).use(AntDesign).mount("#app");
