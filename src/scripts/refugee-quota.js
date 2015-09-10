window.addEventListener('DOMContentLoaded', function () {
	'use strict';

	queue()
		.defer(d3.json, 'data/world.topojson')
		.defer(d3.tsv, 'data/applications.tsv')
		.await(function (error, data, tsv) {
			var applications = {};
			var maxPeoplePerMonth = 0;
			tsv.forEach(function (row) {
				var country = row.country;
				var people = 0, months = 0;
				Object.keys(row).forEach(function (key) {
					var parsed = parseInt(row[key], 10);
					if (!isNaN(parsed)) {
						people += parsed;
						++months;
					}
				});
				var peoplePerMonth = people / months;
				if (maxPeoplePerMonth < peoplePerMonth) maxPeoplePerMonth = peoplePerMonth;
				applications[country] = {
					peoplePerMonth: peoplePerMonth,
				};
			});
			console.log(applications);

			var world = topojson.feature(data, data.objects.ne_110m_admin_0_countries);
			var europe = world.features.filter(function (f) {
				return f.properties.region_un === 'Europe';
			});

			var svg = d3.select('.refugee-quota').append('svg');

			var projection = d3.geo.mercator();
			var path = d3.geo.path()
				.projection(projection);
			var scale = d3.scale.linear()
				.domain([ 0, 0.0002 ])
				.range([ '#fff', '#000' ]);

			var countries = svg.selectAll('path')
				.data(europe)
				.enter()
				.append('path')
				.attr('d', path)
				.filter(function (d) { return applications[d.properties.iso_a2]; })
				.attr('fill', function (d) {
					return scale(applications[d.properties.iso_a2].peoplePerMonth / d.properties.pop_est);
				});
		});
});
