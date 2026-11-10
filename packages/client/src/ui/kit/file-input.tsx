import type * as React from 'react';

/** The unseen file chooser inside a Button's `<label>`: pressing the button opens it. */
function FileInput(props: Readonly<Omit<React.ComponentProps<'input'>, 'type' | 'hidden'>>) {
  return <input data-slot="file-input" type="file" hidden {...props} />;
}

export { FileInput };
