import { useEffect } from "react";

/**
 * Sets the document.title in canonical format: "<Page> · ShadowScope"
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
