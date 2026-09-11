import { mountCompanion } from '@netproof/companion-ui';

/**
 * The web companion.
 *
 * Everything the user sees lives in `@netproof/companion-ui`, shared with the Chrome
 * extension's tab. This file exists only to say "the data goes in `localStorage`", which is
 * what the default adapter does.
 */
mountCompanion();
