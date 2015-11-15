(function () {
  'use strict';

  angular
    .module('delayLocationChange', [])
    .service('delayLocationChange', function ($rootScope, $q, $timeout, $location, $injector) {
        var unfinishedPromises
          , waitingFunctions
          , changeStarted
          , _toUrl
          , _fromUrl
          , nextUrl
          , unlisten;

        function service(arg) {
          if (arg.then) {
            // handles a promise
            addPromise(arg);
          } else {
            // assume it's a function
            if (changeStarted) {
              addPromise($injector.invoke(fn));
            } else {
              // need to wait until angular started the locationChange, otherwise
              // something might start running before it's should
              waitingFunctions.push(arg);
            }
          }
        }

        //  we make sure that all promises finish by counting the number of promises
        // we recieved
        unfinishedPromises = 0;
        waitingFunctions = [];
        changeStarted = false;

        // checkPromises both determines if all promises were resolved and initiates
        // the delayed location change if no more promises remain
        function checkPromises() {
          unfinishedPromises--;
          if (changeStarted && unfinishedPromises <= 0) {
            reloadChange();
          }
        }

        function reloadChange() {
          if ($location.absUrl() === _toUrl) {
            // we are running on the assumption (that might prove false at some point)
            // that nothing happens between canceling $locationChangeStart and emitting
            // $locationChangeSuccess
            $rootScope.$broadcast('$locationChangeSuccess', _toUrl, _fromUrl);
          } else {
            $location.url(nextUrl);
          }
        }

        function addPromise(promise) {
          unfinishedPromises++;
          // to access using array notation because finally is a reserved word
          promise.finally(checkPromises);
        }

        unlisten = $rootScope.$on('$locationChangeStart', function (e, toUrl, fromUrl) {
          changeStarted = true;
          nextUrl = $location.url();
          unlisten();
          // We are relying on the fact that since the url never actually changed,
          // the fact that angular will return to the previous ulr when doing preventDefault, will not
          //  have any effect
          e.preventDefault();
          waitingFunctions.forEach(function (fn) {
            addPromise($injector.invoke(fn));
          });

          if (unfinishedPromises === 0 && !_toUrl) {
            // firstCall and no promises
            // we need to let at least one run through to verify
            // no promises will be added
            unfinishedPromises++;
            $timeout(checkPromises, 1);
          }
          _toUrl = toUrl;
          _fromUrl = fromUrl;
        });

        return service;
      }
    );
})();
