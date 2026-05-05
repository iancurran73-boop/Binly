insert into bindicator_councils (id, name, region, bin_types, missed_collection_url, source_url, data_strategy, notes) values
('merthyr-tydfil', 'Merthyr Tydfil', 'Wales', '[{"type": "General waste", "color": "#28251D", "frequency": "fortnightly"}, {"type": "Recycling", "color": "#20808D", "frequency": "fortnightly"}, {"type": "Garden waste", "color": "#5A7C3A", "frequency": "monthly"}]'::jsonb, 'https://www.google.com/search?q=Merthyr+Tydfil+council+missed+bin+collection', NULL, 'waitlist', 'GSS: W06000024; Country: Wales');

-- Items will be reseeded by a separate SQL);