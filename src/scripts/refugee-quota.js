window.addEventListener('DOMContentLoaded', function () {
	'use strict';

	window.debug = {};

	// Graph setup
	var MARGIN = 10;
	var WIDTH = 750;
	var HEIGHT = 750;

	// Additional data
	var schengenCountries = [
		'AT', 'BE', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
		'HU', 'IS', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL',
		'NO', 'PL', 'PT', 'SK', 'SI', 'ES', 'SE', 'CH'];
	function isSchengenCountry(feature) {
		return schengenCountries.indexOf(feature.properties.iso_a2) !== -1;
	}

	// D3 helpers
	function translate(x, y) {
		return 'translate(' + x + ', ' + y + ')';
	}
	// Returns a function that retrieves the specified properties of an object
	// or array, or an arbitrarily nested hierarchy thereof.
	// When invoked without arguments, returns the identity function.
	function ƒ(/* args ... */) {
		var args = arguments, l = arguments.length;
		return function (item) {
			for (var i = 0; i < l; i++) { item = item[args[i]]; }
			return item;
		}
	}
	// Returns the projected centroid for the largest polygon of a MultiPolygon
	// (the polygon with the most coordinates is assumed to be the largest).
	// This is very useful for France whose overseas departments drag its
	// centroid out into the Atlantic Ocean.
	function mainCentroid(path, feature) {
		var coordinates = feature.geometry.coordinates;
		if (coordinates.length > 1) {
			// This could be written more efficiently.
			coordinates = coordinates.slice().sort(function (a, b) {
				return b[0].length - a[0].length;
			}).slice(0, 1);
			feature = { type: feature.type, geometry: {
				type: feature.geometry.type,
				coordinates: coordinates
			} };
		}
		return path.centroid(feature);
	}

	queue()
		.defer(d3.json, 'data/world.topojson')
		.defer(d3.tsv, 'data/applications.tsv')
		.await(function (error, geo, applications) {
			var svg = d3.select('.refugee-quota').append('svg')
				.attr('preserveAspectRatio', 'xMidYMid')
				.attr('viewBox', [ 0, 0, WIDTH, HEIGHT ].join(' '));
			var stage = svg.append('g');

			applications = applications.map(function (row) {
				return {
					country:       row.country,
					count:        +row.count,
					gdp:          +row.gdp,
					gdpPerCapita: +row['gdp/capita'],
					applications: +row.nsum,
					relAps:       +row.nsum / (+row['gdp/capita'] * +row.population),
					population:	  +row.population,
				};
			}).sort(function (a, b) {
				return b.gdpPerCapita - a.gdpPerCapita;
			});
			var byCountry = {};
			applications.forEach(function (a) { byCountry[a.country] = a; });
			console.log(applications);

			var rPop = d3.scale.sqrt()
				.domain([ 0, d3.sum(applications, ƒ('population')) ])
				.range([ 0, WIDTH/8 ]);
			var rApp = d3.scale.sqrt()
				.domain([ 0, d3.sum(applications, ƒ('applications')) ])
				.range([ 0, WIDTH/8 ]);
			var rGDP = d3.scale.sqrt()
				.domain([ 0, d3.sum(applications, ƒ('gdp')) ])
				.range([ 0, WIDTH/8 ]);
			var projection = d3.geo.conicConformal()
				.parallels([ 65, 35 ])
				.center([ 0, 52 ])
				.rotate([ -10, 0 ])
				.translate([ WIDTH/2, HEIGHT/2 ])
				.scale(1300);
			var path = d3.geo.path()
				.projection(projection);

			var world = topojson.feature(geo, geo.objects.ne_110m_admin_0_countries);
			var borders = topojson.mesh(geo, geo.objects.ne_110m_admin_0_countries,
				function(a, b) { return a !== b; });
			console.log(borders)
			var schengen = topojson.merge(geo, geo.objects.ne_110m_admin_0_countries.geometries.filter(isSchengenCountry));
			debug.world = world;

			var paths = stage.selectAll('path')
				.data(world.features)
				.enter()
				.append('path')
				.attr('class', 'country')
				.classed('no-data', function (f) { return !byCountry[f.properties.iso_a2]; })
				.attr('d', path);
			var borderPaths = stage.append('path')
				.datum(borders)
				.attr('class', 'border')
				.attr('d', path);
			var schengenPath = stage.append('path')
				.datum(schengen)
				.attr('class', 'schengen')
				.attr('d', path);

			var countryGroups = stage.selectAll('g.country')
				.data(world.features.filter(function (f) { return byCountry[f.properties.iso_a2]; }))
				.enter()
				.append('g')
				.attr('class', 'country')
				.attr('transform', function (f) { return translate.apply(null, mainCentroid(path, f)); });

			var applicationCircles = countryGroups.append('circle')
				.attr('class', 'application-count')
				.attr('r', function (f) { return rApp(byCountry[f.properties.iso_a2].applications); });

			var metricCircles = countryGroups.append('circle')
				.attr('class', 'metric')
				.attr('r', function (f) { return rPop(byCountry[f.properties.iso_a2].population); });

			// As a sanity check, calculate the total area of all three sets of circles
			var totalAreas = { population: 0, gdp: 0, applications: 0 };
			applications.forEach(function (d) {
				totalAreas.population   += Math.pow(rPop(d.population), 2);
				totalAreas.gdp          += Math.pow(rGDP(d.gdp), 2);
				totalAreas.applications += Math.pow(rApp(d.applications), 2);
			});
			window.debug.totalAreas = totalAreas;

			function resize() {
				var rect = svg.node().getBoundingClientRect();
				var width = rect.width - 2 * MARGIN;
				var height = rect.height - 2 * MARGIN;
			}
			function setMetric(metric) {
				if (metric === 'population') {
					metricCircles.transition().attr('r',
						function (f) { return rPop(byCountry[f.properties.iso_a2].population); });
				} else if (metric === 'gdp') {
					metricCircles.transition().attr('r',
						function (f) { return rGDP(byCountry[f.properties.iso_a2].gdp); });
				}
			}

			window.debug.setMetric = setMetric;
			window.addEventListener('resize', resize);
			resize();
		});
});
