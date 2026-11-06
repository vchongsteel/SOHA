import { defineRailway, github, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const sohaVolume = volume("soha-volume", { alerts: { usage: { "100": {}, "80": {}, "95": {} } }, allowOnlineResize: true, region: "iad", sizeMB: 5000 });
  const soha = service("soha", {
    source: github("vchongsteel/SOHA", { branch: "main", checkSuites: false }),
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    replicas: { "iad": 1 },
    volumeMounts: { "/data": sohaVolume },
  });

  return project("SOHA", {
    variables: { managed: false },
    resources: [soha, sohaVolume],
  });
});
