window.addEventListener('DOMContentLoaded', function () {
	'use strict';
	/* global d3, queue, topojson */

	window.debug = {};

	// Graph setup
	var MARGIN = 10;
	var WIDTH = 750;
	var HEIGHT = 750;
	var MAX_SQUARE = WIDTH / 3.5;

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
			var container = d3.select('.refugee-quota');
			var svg = container.append('svg')
				.attr('class', 'visualization')
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
					population:	  +row.population,
					markerX:      +row.markerX || 0,
					markerY:      +row.markerY || 0,
				};
			}).sort(function (a, b) {
				return b.gdpPerCapita - a.gdpPerCapita;
			});
			var byCountry = {};
			var totals = {
				applications: d3.sum(applications, ƒ('applications')),
				population:   d3.sum(applications, ƒ('population')),
				gdp:          d3.sum(applications, ƒ('gdp')),
			};
			applications.forEach(function (a) {
				// Calculate relative values
				a.relative = {
					applications: a.applications/totals.applications,
					population:   a.population/totals.population,
					gdp:          a.gdp/totals.gdp,
				};
				// Fill byCountry object
				byCountry[a.country] = a;
			});

			// Scales and formats
			var rPop = d3.scale.sqrt()
				.domain([ 0, totals.population ])
				.range([ 0, MAX_SQUARE ]);
			var rApp = d3.scale.sqrt()
				.domain([ 0, totals.applications ])
				.range([ 0, MAX_SQUARE ]);
			var rGDP = d3.scale.sqrt()
				.domain([ 0, totals.gdp ])
				.range([ 0, MAX_SQUARE ]);
			var projection = d3.geo.conicConformal()
				.parallels([ 65, 35 ])
				.center([ 0, 52 ])
				.rotate([ -10, 0 ])
				.translate([ WIDTH/2, HEIGHT/2 ])
				.scale(1300);
			var path = d3.geo.path()
				.projection(projection);
			var numberFormat = d3.format(',f');
			var percentFormat = d3.format('.1%');

			// State
			var metric = 'population';
			var rectSide = {
				population: function (f) { return rPop(f.data.population); },
				gdp:        function (f) { return rGDP(f.data.gdp); },
			};

			// Tooltip
			var tooltip = (function () {
				var tt = container.append('aside')
					.datum(null)
					.attr('class', 'tooltip hidden');
				var countryName = tt.append('header').append('h3');
				var values = tt.append('div').attr('class', 'values');
				var stats = [
					{ name: 'applications', label: 'Applications', relative: true },
					{ name: 'by-metric',
						label: function () { return 'Applications if they were distributed by ' + metric; },
						value: function (f) { return totals.applications * f.data.relative[metric]; }
					},
					{ name: 'gdp', label: 'GDP', unit: '€ _ M', relative: true },
					{ name: 'population', label: 'Population', relative: true },
				];
				var statsP = values.selectAll('.statistic')
					.data(stats)
					.enter()
					.append('p')
						.attr('class', 'statistic');
				var statsSpan = statsP.append('span').attr('class', 'number')
				var statLabels = statsP.append('span');

				var statsRelative = statsP.filter(ƒ('relative')).append('small');
				var statsRelativeSpan = statsRelative.append('span');
				statsRelative.append('span').text(' of EU total');

				function show(f) {
					if (tt.datum() === f) return;
					if (!f.data) return;
					tt.datum(f);
					tt.classed('hidden', false);

					// Set position
					var group = countryGroups.filter(function (g) { return g === f; });
					var gRect = group.node().getBoundingClientRect();
					var cRect = container.node().getBoundingClientRect();
					var left, right;
					if (gRect.left + gRect.width / 2 > cRect.width / 2) {
						left = 'auto';
						right = cRect.width - gRect.left + 5 + 'px';
					} else {
						left = (gRect.left - cRect.left) + gRect.width + 5 + 'px';
						right = 'auto';
					}
					tt.style({
						left: left, right: right,
						top: gRect.top - cRect.top + 'px' });

					// Fill elements
					countryName.text(f.properties.name);
					statLabels.text(function (s) {
						return (typeof s.label === 'function') ? s.label() : s.label; });
					statsSpan.text(function (s) {
						var unit = s.unit || '_';
						if (s.value) return numberFormat(s.value(f))
						else return unit.replace('_', numberFormat(f.data[s.name])); });
					statsRelativeSpan.text(function (s) { return percentFormat(f.data.relative[s.name]); });
					//adjustedCount.text(numberFormat(totals.applications * f.data.relative[metric]));
				}
				function hide() {
					if (!tt.datum()) return;
					tt.datum(null);
					tt.classed('hidden', true);
				}
				return { show: show, hide: hide };
			})();


			var world = topojson.feature(geo, geo.objects.ne_110m_admin_0_countries);
			var borders = topojson.mesh(geo, geo.objects.ne_110m_admin_0_countries,
				function(a, b) { return a !== b; });
			var schengen = topojson.merge(geo, geo.objects.ne_110m_admin_0_countries.geometries.filter(isSchengenCountry));
			world.features.forEach(function (f) {
				f.data = byCountry[f.properties.iso_a2];
				if (f.data) f.data.feature = f;
			});

			// Project the squares' coordinates
			applications.forEach(function (a) {
				var feature = a.feature;
				if (!feature) return;
				var centroid = mainCentroid(path, feature);
				feature.x = centroid[0];
				feature.y = centroid[1];
				feature.w = Math.max( rPop(a.population), rGDP(a.gdp), rApp(a.applications) );
			});
			debug.world = world;

			var paths = stage.selectAll('path')
				.data(world.features)
				.enter()
				.append('path')
				.attr('class', 'country')
				.classed('no-data', function (f) { return !f.data; })
				.attr('d', path)
				.on('mouseenter', tooltip.show)
				.on('mouseleave', tooltip.hide);
			var borderPaths = stage.append('path')
				.datum(borders)
				.attr('class', 'border')
				.attr('d', path);
			var schengenPath = stage.append('path')
				.datum(schengen)
				.attr('class', 'schengen')
				.attr('d', path);

			var countryGroups = stage.selectAll('g.country')
				.data(world.features.filter(ƒ('data')))
				.enter()
				.append('g')
				.attr('class', 'country')
				.attr('transform', function (f) {
					return translate(f.x - f.w / 2 + f.data.markerX, f.y + f.w / 2 + f.data.markerY) + ' scale(1, -1)';
				})
				.on('mouseenter', tooltip.show)
				.on('mouseleave', tooltip.hide);

			var metricRects = countryGroups.append('rect')
				.attr('class', 'metric')
				.attr('width', function (f) { return rPop(f.data.population); })
				.attr('height', function (f) { return rPop(f.data.population); });

			var applicationRects = countryGroups.append('rect')
				.attr('class', 'application-count')
				.attr('width', function (f) { return rApp(f.data.applications); })
				.attr('height', function (f) { return rApp(f.data.applications); });

			var metricRectOutlines = countryGroups.append('rect')
				.attr('class', 'metric-outline')
				.attr('width', function (f) { return rPop(f.data.population); })
				.attr('height', function (f) { return rPop(f.data.population); });

			// Legend
			var legend = container.append('div')
				.attr('class', 'legend');
			var dl = legend.append('dl');
			dl.append('dt')
				.append('svg')
					.attr({ width: 30, height: 30 })
					.append('rect')
						.attr({ 'class': 'application-count', cx: 15, cy: 15, r: 12 });
			dl.append('dd')
				.text('Number of asylum applications by Syrians, Eritreans, and Iraqis (April—June 2015*)')
			dl.append('dt')
				.append('svg')
					.attr({ width: 30, height: 30 })
					.append('rect')
						.attr({ 'class': 'metric', cx: 15, cy: 15, r: 12 });
			var metricControl = dl.append('dd')
				.attr('class', 'controls')
				.text('Number of applications if they were equally distributed by ')
				.selectAll('button')
					.data([ 'population', 'GDP' ])
					.enter()
					.append('button')
					.text(ƒ())
					.on('click', setMetric);
			dl.append('dt')
				.append('svg')
					.attr({ width: 30, height: 4 })
					.append('path')
						.attr('class', 'schengen')
						.attr('d', 'M 3 2 L 27 2');
			dl.append('dd')
				.text('Schengen Area');

			legend.append('p').append('small').text('* June data estimated for Cyprus')

			// As a sanity check, calculate the total area of all three sets of rects
			var totalAreas = { population: 0, gdp: 0, applications: 0 };
			applications.forEach(function (d) {
				totalAreas.population   += Math.pow(rPop(d.population), 2);
				totalAreas.gdp          += Math.pow(rGDP(d.gdp), 2);
				totalAreas.applications += Math.pow(rApp(d.applications), 2);
			});
			window.debug.totalAreas = totalAreas;

			function resize() {
				var rect = svg.node().getBoundingClientRect();
				var width = Math.min(rect.width - 2 * MARGIN, WIDTH);
				var height = rect.height - 2 * MARGIN;

				var fontSize = 400/Math.sqrt(width);

				svg.selectAll('text').attr('font-size', fontSize);
			}
			function setMetric(m) {
				d3.selectAll('.js-metric-name').text(m);
				metric = m.toLowerCase();
				metricControl.classed('active', function (m) { return m.toLowerCase() === metric; });
				metricRects.transition().attr('width', rectSide[metric]).attr('height', rectSide[metric]);
				metricRectOutlines.transition().attr('width', rectSide[metric]).attr('height', rectSide[metric]);
			}
			setMetric('population');

			window.debug.setMetric = setMetric;
			window.addEventListener('resize', resize);
			resize();
		});
});
