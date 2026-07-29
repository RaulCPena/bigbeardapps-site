/* Launch-list progressive enhancement.

   Without this file the form does a normal POST and the browser navigates to the
   provider's confirmation page — which works, just abruptly.

   With it, the POST is retargeted at a hidden iframe so the page stays put and a
   "check your inbox" message replaces the form.

   Deliberately NOT fetch(): the provider is cross-origin and may not send CORS
   headers, in which case fetch either rejects or returns an opaque response that
   cannot distinguish success from failure. A form target always posts.

   Two things here are load-bearing, both learned the hard way:

   1. The success message is shown on the iframe's load event, NOT on submit.
      Showing it on submit means claiming success before the server has said
      anything — and if the request fails, the visitor is told they subscribed
      when they did not.

   2. The form is hidden, never removed, and only after the response. Calling
      replaceWith() inside the submit handler detaches the form mid-flight and
      the browser cancels the POST outright: message shown, nobody subscribed.

   The target is set from JS, never in the markup: in the HTML, a visitor with JS
   disabled would post into a hidden iframe and see nothing happen at all. */
(function () {
    var form = document.querySelector('.launch-list__form');
    if (!form) return;

    var sink = document.createElement('iframe');
    sink.name = 'launch-list-sink';
    sink.setAttribute('aria-hidden', 'true');
    sink.setAttribute('tabindex', '-1');
    sink.style.cssText = 'position:absolute;width:0;height:0;border:0;left:-9999px';
    document.body.appendChild(sink);
    form.target = 'launch-list-sink';

    var pending = false;

    form.addEventListener('submit', function () {
        if (!form.checkValidity()) return;   // let the browser show its own message
        pending = true;
        form.querySelector('button[type=submit]').disabled = true;
    });

    // Fires for the initial about:blank too, hence the guard.
    sink.addEventListener('load', function () {
        if (!pending) return;
        pending = false;

        var done = document.createElement('p');
        done.className = 'launch-list__done';
        done.setAttribute('role', 'status');
        done.textContent = 'Check your inbox — click the confirmation link and you’re on the list.';
        form.style.display = 'none';
        form.parentNode.insertBefore(done, form);
    });
})();
