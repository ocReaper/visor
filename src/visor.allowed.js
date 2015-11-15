(function () {
  'use strict';

  angular
    .module('visor.allowed', [
      'visor.permissions'
    ])
    .directive('showIfAllowed', function (visorPermissions, $animate) {
      return {
        restrict: 'A',
        link: function (scope, element, attr) {
          var unListen = visorPermissions.notifyOnCacheClear(function () {
            syncElement(attr.showIfAllowed);
          });

          function syncElement(value) {
            // Copied from ngHideDirective (v1.3.13)
            var allowed = visorPermissions.checkPermissionsForRoute(value);
            $animate[allowed ? 'removeClass' : 'addClass'](element, 'ng-hide', {
              tempClasses: 'ng-hide-animate'
            });
          }

          attr.$observe('showIfAllowed', syncElement);
          scope.$on('$destroy', unListen);
        }
      };
    })
    .directive('classIfRestricted', function (visorPermissions, $animate) {
      return {
        restrict: 'A',
        link: function (scope, element, attr) {
          var unListen = visorPermissions.notifyOnCacheClear(function () {
            syncElement(attr.classIfRestricted);
          });

          function syncElement(value) {
            var allowed = visorPermissions.checkPermissionsForRoute(value);
            $animate[!allowed ? 'addClass' : 'removeClass'](element, attr.restrictedClass || 'visor-restricted');
          }

          attr.$observe('classIfRestricted', syncElement);
          scope.$on('$destroy', unListen);
        }
      };
    });
})();
