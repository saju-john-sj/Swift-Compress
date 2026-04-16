/*! coi-serviceworker v0.1.7 | MIT License | https://github.com/gzuidhof/coi-serviceworker */
if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

    self.addEventListener("fetch", (event) => {
        if (event.request.cache === "only-if-cached" && event.request.mode !== "same-origin") {
            return;
        }

        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.status === 0) {
                        return response;
                    }

                    const newHeaders = new Headers(response.headers);
                    newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
                    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders,
                    });
                })
                .catch((e) => console.error(e))
        );
    });
} else {
    (() => {
        const script = document.currentScript;
        const coi = {
            shouldRegister: () => true,
            shouldDereigster: () => false,
            doNotReload: false,
            quiet: false,
            ...script.dataset
        };

        if (coi.shouldDereigster()) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                for (let registration of registrations) {
                    registration.unregister();
                }
            });
        }

        if (coi.shouldRegister()) {
            window.addEventListener("load", async () => {
                try {
                    const registration = await navigator.serviceWorker.register("/coi-serviceworker.js");
                    if (registration.installing) {
                        registration.installing.addEventListener("statechange", (e) => {
                            if (e.target.state === "activated") {
                                if (!coi.doNotReload) window.location.reload();
                            }
                        });
                    }
                } catch (e) {
                    console.error("COI Service Worker registration failed:", e);
                }
            });
        }
    })();
}
