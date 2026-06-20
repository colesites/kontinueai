import {
	createImageUrlBuilder,
	type SanityImageSource,
} from "@sanity/image-url";
import { client } from "./client";

const builder = createImageUrlBuilder(client);

export const urlFor = (source: SanityImageSource) => builder.image(source);
