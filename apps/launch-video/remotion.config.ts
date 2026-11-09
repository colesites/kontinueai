import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// Higher quality than the default for a launch film.
Config.setCrf(16);
// WebGL for the 3D shots.
Config.setChromiumOpenGlRenderer("angle");
